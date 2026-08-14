import { Schema } from 'mongoose'

export const ProductSchema = new Schema(
  {
    name:        { type: String, required: true, minlength: 2, maxlength: 100 },
    description: { type: String, required: true },
    price:       { type: Number, required: true, min: 0 },
    stock:       { type: Number, required: true, min: 0 },
    category:    { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    status:      { type: String, enum: ['active', 'inactive', 'out_of_stock'], default: 'active' },
  },
  { timestamps: true }
)
