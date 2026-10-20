const jwt = require('jsonwebtoken');

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, username: user.username, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signToken, verifyToken };
