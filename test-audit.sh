TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"io.vance","password":"SimsSecure2026!"}' | grep -o '"token":"[^"]*' | grep -o '[^"]*$')

curl -s http://localhost:3000/api/audit/verify -H "Authorization: Bearer $TOKEN"
