// middleware/authMiddleware.js
export default (req,res,next) => {
  const token = req.cookies?.auth_token;
  if (!token) return res.status(401).json({ error:'Geen token' });
  req.token = token;
  next();
};
