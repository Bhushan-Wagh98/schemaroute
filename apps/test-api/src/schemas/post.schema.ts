import { Schema } from 'mongoose'

export const PostSchema = new Schema(
  {
    title:   { type: String, required: true, minlength: 3, maxlength: 100 },
    content: { type: String, required: true },
    author:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tags:    [{ type: String }],
    status:  { type: String, enum: ['draft', 'published'], default: 'draft' },
  },
  { timestamps: true }
)
