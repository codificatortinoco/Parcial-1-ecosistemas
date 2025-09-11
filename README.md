## Subastas - HTTP REST

### Instalación y ejecución
```bash
npm install
npm run start
```
El servidor corre en `http://localhost:5080`.

### Links de acceso
- Players App: `http://localhost:5080/players-app`
- Monitor App: `http://localhost:5080/monitor-app`

### Endpoints principales
- POST `/users/register` { name }
- GET `/items?sort=highestBid`
- POST `/items/:id/bid` { userId, amount }
- POST `/auction/openAll`
- POST `/auction/closeAll`
- GET `/auction/state`

### Notas
- La subasta dura 60s desde el monitor (al abrirla). También puede cerrarse manualmente.

###Swimlane 
https://drive.google.com/file/d/1HXmartJKTP5BwOUA3bReE9vdFwr8og7d/view?usp=sharing 
