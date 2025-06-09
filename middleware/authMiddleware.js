module.exports = (req, res, next) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Geen token meegegeven' });
  req.token = token;
  next();
};
