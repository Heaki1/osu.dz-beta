import { pool } from '../db.js';

export type DuelRow = {
  id: number; status: 'open'|'live'|'settled'; challenger_user_id: number;
  challenger: string; challenger_avatar: string|null; opponent_user_id: number|null;
  opponent: string|null; opponent_avatar: string|null; difficulty_id: number;
  title: string; artist: string; difficulty_name: string; stars: number;
  mods: string; requirement: string; stake: number; ends_at: Date;
  challenger_score: number|null; opponent_score: number|null;
  challenger_accuracy: number|null; opponent_accuracy: number|null;
  challenger_misses: number|null; opponent_misses: number|null;
};

const SELECT = 'SELECT d.*, cu.username challenger, cu.avatar_url challenger_avatar, ou.username opponent, ou.avatar_url opponent_avatar FROM duels d JOIN users cu ON cu.id=d.challenger_user_id LEFT JOIN users ou ON ou.id=d.opponent_user_id';

export async function listDuels(userId?: number) {
  const { rows } = await pool.query<DuelRow>(SELECT + ' WHERE d.status <> $1 OR d.challenger_user_id=$2 OR d.opponent_user_id=$2 ORDER BY d.created_at DESC', ['settled', userId ?? 0]);
  return rows;
}
export async function getDuel(id: number) {
  const { rows } = await pool.query<DuelRow>(SELECT + ' WHERE d.id=$1', [id]);
  return rows[0] ?? null;
}
export async function getBalance(userId: number) {
  // Duel DZPP starts from the player's real platform DZPP total. Duel wins/losses
  // are then applied as a separate spendable ledger, so the ranking DZPP itself
  // remains unchanged while the duel bank still matches the DZPP shown elsewhere.
  const { rows } = await pool.query<{ balance: number }>(
    `SELECT (
       COALESCE((SELECT SUM(final_dzpp) FROM round_dzpp WHERE user_id = $1), 0)
       + COALESCE((SELECT SUM(amount) FROM duel_ledger WHERE user_id = $1), 0)
     )::int AS balance`,
    [userId]
  );
  return rows[0]?.balance ?? 0;
}
export async function createDuel(userId: number, input: { difficultyId:number; title:string; artist:string; difficulty:string; stars:number; mods:string; requirement:string; stake:number }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const balance = await client.query<{balance:number}>(
      `SELECT (
         COALESCE((SELECT SUM(final_dzpp) FROM round_dzpp WHERE user_id = $1), 0)
         + COALESCE((SELECT SUM(amount) FROM duel_ledger WHERE user_id = $1), 0)
       )::int AS balance`,
      [userId]
    );
    if ((balance.rows[0]?.balance ?? 0) < input.stake) throw new Error('INSUFFICIENT_FUNDS');
    const { rows } = await client.query<{id:number}>('INSERT INTO duels(challenger_user_id,difficulty_id,title,artist,difficulty_name,stars,mods,requirement,stake,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval \'24 hours\') RETURNING id', [userId,input.difficultyId,input.title,input.artist,input.difficulty,input.stars,input.mods,input.requirement,input.stake]);
    await client.query('INSERT INTO duel_ledger(duel_id,user_id,amount,transaction_type) VALUES($1,$2,$3,\'stake\')', [rows[0].id,userId,-input.stake]);
    await client.query('COMMIT'); return rows[0].id;
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}
export async function acceptDuel(userId:number, duelId:number) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows}=await client.query<DuelRow>(SELECT + ' WHERE d.id=$1',[duelId]); const duel=rows[0];
    if(!duel) throw new Error('NOT_FOUND'); if(duel.status!=='open') throw new Error('NOT_OPEN'); if(duel.challenger_user_id===userId) throw new Error('SELF_ACCEPT');
    const bal=await client.query<{balance:number}>(
      `SELECT (
         COALESCE((SELECT SUM(final_dzpp) FROM round_dzpp WHERE user_id = $1), 0)
         + COALESCE((SELECT SUM(amount) FROM duel_ledger WHERE user_id = $1), 0)
       )::int AS balance`,
      [userId]
    );
    if((bal.rows[0]?.balance??0)<duel.stake) throw new Error('INSUFFICIENT_FUNDS');
    await client.query('UPDATE duels SET opponent_user_id=$1,status=\'live\',ends_at=now()+interval \'24 hours\' WHERE id=$2',[userId,duelId]);
    await client.query('INSERT INTO duel_ledger(duel_id,user_id,amount,transaction_type) VALUES($1,$2,$3,\'stake\')',[duelId,userId,-duel.stake]);
    await client.query('COMMIT');
  } catch(err){await client.query('ROLLBACK');throw err;} finally{client.release();}
}
export async function recordScore(duelId:number,userId:number,score:number,osuScoreId:number,accuracy:number,misses:number) {
  const duel=await getDuel(duelId); if(!duel||duel.status!=='live') throw new Error('NOT_LIVE');
  const side=duel.challenger_user_id===userId?'challenger':duel.opponent_user_id===userId?'opponent':null; if(!side) throw new Error('FORBIDDEN');
  const field=side==='challenger'?'challenger_score':'opponent_score'; const idField=side==='challenger'?'challenger_score_id':'opponent_score_id';
  const accuracyField=side==='challenger'?'challenger_accuracy':'opponent_accuracy'; const missesField=side==='challenger'?'challenger_misses':'opponent_misses';
  await pool.query('UPDATE duels SET '+field+'=$1,'+idField+'=$2,'+accuracyField+'=$3,'+missesField+'=$4 WHERE id=$5',[score,osuScoreId,accuracy,misses,duelId]); return getDuel(duelId);
}
export async function settleExpiredDuels() {
  const {rows}=await pool.query<DuelRow>(SELECT + ' WHERE d.status=\'live\' AND d.ends_at<=now()');
  for(const duel of rows){
    const winner=duel.requirement==='Best accuracy'
      ? (duel.challenger_accuracy!==null&&(duel.opponent_accuracy===null||duel.challenger_accuracy>duel.opponent_accuracy)?duel.challenger_user_id:duel.opponent_accuracy!==null&&(duel.challenger_accuracy===null||duel.opponent_accuracy>duel.challenger_accuracy)?duel.opponent_user_id:null)
      : duel.requirement==='Full Combo'
        ? (duel.challenger_misses===0&&(duel.opponent_misses!==0||duel.opponent_misses===null)?duel.challenger_user_id:duel.opponent_misses===0&&(duel.challenger_misses!==0||duel.challenger_misses===null)?duel.opponent_user_id:null)
        : duel.requirement==='Lowest Miss Count'
          ? (duel.challenger_misses!==null&&(duel.opponent_misses===null||duel.challenger_misses<duel.opponent_misses)?duel.challenger_user_id:duel.opponent_misses!==null&&(duel.challenger_misses===null||duel.opponent_misses<duel.challenger_misses)?duel.opponent_user_id:null)
          : (duel.challenger_score!==null&&(duel.opponent_score===null||duel.challenger_score>duel.opponent_score)?duel.challenger_user_id:duel.opponent_score!==null&&(duel.challenger_score===null||duel.opponent_score>duel.challenger_score)?duel.opponent_user_id:null);
    await pool.query('UPDATE duels SET status=\'settled\',settled_at=now() WHERE id=$1',[duel.id]);
    if(winner!==null) await pool.query('INSERT INTO duel_ledger(duel_id,user_id,amount,transaction_type) VALUES($1,$2,$3,\'payout\')',[duel.id,winner,duel.stake*2]);
    else {
      await pool.query('INSERT INTO duel_ledger(duel_id,user_id,amount,transaction_type) VALUES($1,$2,$3,\'refund\')',[duel.id,duel.challenger_user_id,duel.stake]);
      if(duel.opponent_user_id) await pool.query('INSERT INTO duel_ledger(duel_id,user_id,amount,transaction_type) VALUES($1,$2,$3,\'refund\')',[duel.id,duel.opponent_user_id,duel.stake]);
    }
  }
}
