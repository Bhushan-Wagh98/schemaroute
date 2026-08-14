import { Schema } from 'mongoose'

export const CategorySchema = new Schema(
  {
    name:        { type: String, required: true, minlength: 2, maxlength: 50 },
    description: { type: String, maxlength: 200 },
    slug:        { type: String, required: true },
  },
  { timestamps: true }
)
