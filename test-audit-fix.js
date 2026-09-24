const crypto = require('crypto');
const { db } = require('./dist/server.cjs');

async function test() {
  const result = await db.query('SELECT * FROM audit_logs ORDER BY sequence_num ASC');
  const logs = result.rows;
  console.log("Details type:", typeof logs[0].details, logs[0].details);
  
  const current = logs[0];
  const timestampIso = new Date(current.timestamp).toISOString();
  
  const detailsStr = typeof current.details === 'object' ? JSON.stringify(current.details) : current.details;
  
  const rawPayload = `${current.prev_hash}|${current.user_id || 'SYSTEM'}|${current.action}|${current.target_type}|${current.target_id || ''}|${detailsStr}|${current.status}|${timestampIso}`;
  console.log("Raw payload generated:", rawPayload);
  const calculatedHash = crypto.createHash('sha256').update(rawPayload).digest('hex');
  console.log("Stored hash:", current.current_hash);
  console.log("Calculated hash:", calculatedHash);
}
test().catch(console.error);
