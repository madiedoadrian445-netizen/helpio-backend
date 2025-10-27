const User = require('../models/User');
const { signJWT } = require('../utils/jwt');

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role = 'client' } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: 'Email already in use' });

    const user = await User.create({ name, email, password, role });
    const token = signJWT({ id: user._id, role: user.role });

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (e) { next(e); }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });

    const token = signJWT({ id: user._id, role: user.role });

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (e) { next(e); }
};

exports.me = async (req, res) => {
  res.json({ user: req.user });
};
