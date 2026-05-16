module.exports = (req, res, next) => {
  // Bypassing authentication for private, personal use
  // We assume there is at least one user in the database with ID 1
  req.user = { id: 1, email: 'admin@yape.pro' };
  next();
};

