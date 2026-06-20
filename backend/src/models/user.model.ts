import { Schema, model, type Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  email: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // Fix vs. blueprint: NO `minlength` here. Mongoose validates the *stored*
    // value, which is the 60-char bcrypt hash — so a `minlength: 12` rule would
    // pass for any password, enforcing nothing. Plaintext length is validated
    // with Zod before it ever reaches the model. `select: false` keeps the hash
    // out of queries unless explicitly requested.
    password: {
      type: String,
      required: true,
      select: false,
    },
  },
  { timestamps: true },
);

// Salt + hash on create/update (12 rounds), only when the password changed.
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function comparePassword(
  candidate: string,
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

export const UserModel = model<IUser>('User', userSchema);
