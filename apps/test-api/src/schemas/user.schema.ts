import { Schema } from 'mongoose'

export const UserSchema = new Schema(
  {
    name:  { type: String, required: true, minlength: 2, maxlength: 50 },
    email: { type: String, required: true },
    age:   { type: Number, min: 1, max: 120 },
    role:  { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  { timestamps: true }
)
