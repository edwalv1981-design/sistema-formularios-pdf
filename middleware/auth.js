const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  // Fallback para URL params
  if (!token && req.query.token) token = req.query.token;
  
  if (token == null) {
    console.warn(`[AUTH_FAIL] Token nulo en ${req.method} ${req.url}`);
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.JWT_SECRET || 'tu_secreto_super_seguro_aqui', (err, user) => {
    if (err) {
      console.error(`[AUTH_FAIL] Error JWT (${err.name}): ${err.message} en ${req.method} ${req.url}`);
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
};

const authorizeRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para realizar esta acción' });
    }
    next();
  };
};

const authenticateTokenOpcional = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  if (!token && req.query.token) token = req.query.token;
  
  if (token == null) return next();

  jwt.verify(token, process.env.JWT_SECRET || 'tu_secreto_super_seguro_aqui', (err, user) => {
    if (!err) req.user = user;
    next();
  });
};

module.exports = { authenticateToken, authorizeRole, authenticateTokenOpcional };
