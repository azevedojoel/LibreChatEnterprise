const bcrypt = require('bcryptjs');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const {
  findUser,
  createUser: createUserModel,
  updateUser: updateUserModel,
  getUserById,
  deleteUserById,
  createToken,
  deleteTokens,
} = require('~/models');
const { getAppConfig } = require('~/server/services/Config');
const { checkEmailConfig } = require('@librechat/api');
const { sendEmail } = require('~/server/utils');

const EXCLUDED_FIELDS = '-password -totpSecret -refreshToken -__v';

/**
 * Creates token and hash for password reset
 * @returns {[string, string]}
 */
const createTokenHash = () => {
  const token = Buffer.from(require('node:crypto').webcrypto.getRandomValues(new Uint8Array(32)))
    .toString('hex');
  const hash = bcrypt.hashSync(token, 10);
  return [token, hash];
};

/**
 * List users with optional search and pagination
 */
const listUsers = async (req, res) => {
  try {
    const User = require('~/db/models').User;
    const { search, limit = 50, page = 1 } = req.query;

    const filter = {};
    if (search && search.trim()) {
      const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { email: regex },
        { name: regex },
        { username: regex },
      ];
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, parseInt(limit, 10) || 50);
    const limitNum = Math.min(100, parseInt(limit, 10) || 50);

    const users = await User.find(filter, EXCLUDED_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await User.countDocuments(filter);

    const sanitizedUsers = users.map((u) => {
      const { _id, ...rest } = u;
      return { _id, id: _id?.toString(), ...rest };
    });

    return res.status(200).json({
      users: sanitizedUsers,
      total,
      page: Math.floor(skip / limitNum) + 1,
      limit: limitNum,
    });
  } catch (error) {
    logger.error('[AdminUserController.listUsers]', error);
    return res.status(500).json({ message: 'Failed to list users' });
  }
};

/**
 * Get single user by ID
 */
const getUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await getUserById(userId, EXCLUDED_FIELDS);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { _id, ...rest } = user;
    return res.status(200).json({ _id, id: _id?.toString(), ...rest });
  } catch (error) {
    logger.error('[AdminUserController.getUser]', error);
    return res.status(500).json({ message: 'Failed to get user' });
  }
};

/**
 * Create a new user (admin only, local provider)
 */
const createUser = async (req, res) => {
  try {
    const { email, password, name, username, role } = req.body;
    const appConfig = await getAppConfig();

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await findUser({ email: normalizedEmail }, 'email _id');

    if (existingUser) {
      return res.status(409).json({ message: 'User with this email already exists' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = password?.trim()
      ? bcrypt.hashSync(password.trim(), salt)
      : undefined;

    const newUserData = {
      provider: 'local',
      email: normalizedEmail,
      username: username?.trim() || undefined,
      name: name?.trim() || undefined,
      role: role === SystemRoles.ADMIN ? SystemRoles.ADMIN : SystemRoles.USER,
      emailVerified: true,
      ...(hashedPassword && { password: hashedPassword }),
    };

    const result = await createUserModel(newUserData, appConfig?.balance, true, true);
    const newUser = typeof result === 'object' ? result : await getUserById(result?.toString() ?? result, EXCLUDED_FIELDS);

    if (!newUser) {
      return res.status(500).json({ message: 'Failed to create user' });
    }

    const { _id, ...rest } = newUser;
    return res.status(201).json({ _id, id: _id?.toString(), ...rest });
  } catch (error) {
    logger.error('[AdminUserController.createUser]', error);
    return res.status(500).json({ message: 'Failed to create user' });
  }
};

/**
 * Update user
 */
const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, username, email, role, emailVerified, password } = req.body;

    const existingUser = await getUserById(userId);
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updateData = {};

    if (name !== undefined) {
      updateData.name = name?.trim() || '';
    }
    if (username !== undefined) {
      updateData.username = username?.trim() || '';
    }
    if (email !== undefined && email?.trim()) {
      const normalizedEmail = email.trim().toLowerCase();
      const otherUser = await findUser({ email: normalizedEmail, _id: { $ne: userId } }, '_id');
      if (otherUser) {
        return res.status(409).json({ message: 'Another user with this email already exists' });
      }
      updateData.email = normalizedEmail;
    }
    if (role !== undefined) {
      updateData.role = role === SystemRoles.ADMIN ? SystemRoles.ADMIN : SystemRoles.USER;
    }
    if (emailVerified !== undefined) {
      updateData.emailVerified = !!emailVerified;
    }
    if (password !== undefined && password?.trim()) {
      updateData.password = bcrypt.hashSync(password.trim(), bcrypt.genSaltSync(10));
    }

    if (Object.keys(updateData).length === 0) {
      const { _id, password: _p, totpSecret: _t, ...rest } = existingUser;
      return res.status(200).json({ _id, id: _id?.toString(), ...rest });
    }

    const updated = await updateUserModel(userId, updateData);
    if (!updated) {
      return res.status(500).json({ message: 'Failed to update user' });
    }

    const { _id, password: _p, totpSecret: _t, ...rest } = updated;
    return res.status(200).json({ _id, id: _id?.toString(), ...rest });
  } catch (error) {
    logger.error('[AdminUserController.updateUser]', error);
    return res.status(500).json({ message: 'Failed to update user' });
  }
};

/**
 * Delete user
 */
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user?.id === userId) {
      return res.status(403).json({ message: 'You cannot delete your own account' });
    }

    const result = await deleteUserById(userId);

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('[AdminUserController.deleteUser]', error);
    return res.status(500).json({ message: 'Failed to delete user' });
  }
};

/**
 * Send password reset email to user (admin-triggered)
 */
const sendPasswordResetEmail = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await getUserById(userId, 'email name username _id provider');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.provider !== 'local') {
      return res.status(400).json({
        message: 'Password reset is only available for users with local authentication',
      });
    }

    const domains = {
      client: process.env.DOMAIN_CLIENT || 'http://localhost:3080',
    };

    await deleteTokens({ userId: user._id });

    const [resetToken, hash] = createTokenHash();

    await createToken({
      userId: user._id,
      token: hash,
      expiresIn: 900,
    });

    const link = `${domains.client}/reset-password?token=${resetToken}&userId=${user._id}`;

    if (checkEmailConfig()) {
      await sendEmail({
        email: user.email,
        subject: 'Password Reset Request',
        payload: {
          appName: process.env.APP_TITLE || 'LibreChat',
          name: user.name || user.username || user.email,
          link,
          year: new Date().getFullYear(),
        },
        template: 'requestPasswordReset.handlebars',
      });
      logger.info(`[AdminUserController.sendPasswordResetEmail] Link emailed. [Email: ${user.email}]`);
    }

    return res.status(200).json({
      message: 'If an account with that email exists, a password reset link has been sent to it.',
      ...(!checkEmailConfig() && { link }),
    });
  } catch (error) {
    logger.error('[AdminUserController.sendPasswordResetEmail]', error);
    return res.status(500).json({ message: 'Failed to send password reset email' });
  }
};

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  sendPasswordResetEmail,
};
