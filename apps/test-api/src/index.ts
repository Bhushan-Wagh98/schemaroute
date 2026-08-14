import 'dotenv/config'
import express, { Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import { createAPI } from '@schemaroute/express'
import { generateOpenAPISpec, mountSwaggerUI } from '@schemaroute/docs'
import { createSDK } from '@schemaroute/sdk'
import { CategorySchema } from './schemas/category.schema'
import { ProductSchema }  from './schemas/product.schema'

const app  = express()
const PORT = process.env['PORT'] ?? 3000

app.use(express.json())

// ── test middlewares ──────────────────────────────────────────────────────────

// simulates token-based auth — pass header: x-api-key: secret123
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['x-api-key']
  if (key !== 'secret123') {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }
  next()
}

// simulates admin role check — pass header: x-role: admin
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const role = req.headers['x-role']
  if (role !== 'admin') {
    res.status(403).json({ success: false, error: 'Forbidden: admin only' })
    return
  }
  next()
}

// request logger — logs method + path + timestamp
function requestLogger(req: Request, _res: Response, next: NextFunction) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
}

// ── health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── connect & start ───────────────────────────────────────────────────────────
mongoose
  .connect(process.env['MONGO_URI'] ?? '', {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  })
  .then(() => {
    console.log('✅ MongoDB connected')

    // register routes AFTER connection so models bind to active connection
    // ── categories ──────────────────────────────────────────────────────────
    // middleware test: getAll is public, create/update/delete require auth+admin
    const categoriesInstance = createAPI(app, CategorySchema, 'categories', {
      pagination: 'page',
      search:     'all-fields',
      exclude:    ['__v'],

      routes: {
        getAll: {
          public:     true,
          sort:       true,
          fields:     true,
          middleware: [requestLogger],           // logs every list request
          rateLimit:  { max: 100, window: '1m' },
        },
        getOne: {
          public:     true,
          middleware: [requestLogger],
        },
        create: {
          validation: true,
          middleware: [requireAuth, requireAdmin], // POST /categories needs auth + admin
          beforeCreate: async (data, ctx) => {
            data['slug'] = String(data['name']).toLowerCase().replace(/\s+/g, '-')
            console.log('[hook] category created by:', ctx.headers['x-api-key'])
            return data
          },
        },
        update: {
          validation: true,
          middleware: [requireAuth, requireAdmin], // PUT /categories/:id needs auth + admin
        },
        delete: {
          middleware: [requireAuth, requireAdmin], // DELETE /categories/:id needs auth + admin
        },
      },
    }, mongoose)

    // ── products ──────────────────────────────────────────────────────────────
    // middleware test: create/update/delete require auth, delete also requires admin
    const productsInstance = createAPI(app, ProductSchema, 'products', {
      pagination: 'both',
      search:     'all-fields',
      populate:   ['category'],
      exclude:    ['__v'],
      transform:  (doc) => ({
        id:          doc['_id'],
        name:        doc['name'],
        price:       doc['price'],
        stock:       doc['stock'],
        status:      doc['status'],
        category:    doc['category'],
        description: doc['description'],
        createdAt:   doc['createdAt'],
      }),

      routes: {
        getAll: {
          public:    true,
          sort:      true,
          fields:    true,
          rateLimit: { max: 100, window: '1m' },
        },
        getOne: {
          public:   true,
          populate: ['category'],
        },
        create: {
          validation: true,
          middleware: [requireAuth],              // POST /products needs auth
          beforeCreate: async (data, ctx) => {
            console.log('[hook] creating product:', data['name'], '| user-agent:', ctx.headers['user-agent'])
            return data
          },
          afterCreate: async (doc, ctx) => {
            console.log('[hook] product created:', String(doc['_id']), '| from ip:', ctx.headers['x-forwarded-for'] ?? 'localhost')
          },
        },
        update: {
          validation: true,
          middleware: [requireAuth],              // PUT /products/:id needs auth
          beforeUpdate: async (data, ctx) => {
            console.log('[hook] updating product | query params:', ctx.query)
            return data
          },
        },
        delete: {
          middleware: [requireAuth, requireAdmin], // DELETE /products/:id needs auth + admin
          afterDelete: async (doc, ctx) => {
            console.log('[hook] product deleted:', String(doc['_id']), '| by role:', ctx.headers['x-role'])
          },
        },
      },

      custom: [
        {
          method:     'GET',
          path:       '/products/active',
          middleware: [requestLogger],            // custom route with middleware
          handler: async (_req, res) => {
            const products = await mongoose
              .model('Product')
              .find({ status: 'active' })
              .populate('category')
              .lean()
            ;(res as express.Response).json({ success: true, data: products })
          },
        },
        {
          method:     'GET',
          path:       '/products/out-of-stock',
          middleware: [requireAuth],              // custom route protected by auth
          handler: async (_req, res) => {
            const products = await mongoose
              .model('Product')
              .find({ stock: 0 })
              .populate('category')
              .lean()
            ;(res as express.Response).json({ success: true, data: products })
          },
        },
      ],
    }, mongoose)

    // ── swagger docs ──────────────────────────────────────────────────────────
    const spec = generateOpenAPISpec([categoriesInstance, productsInstance], {
      title:       'SchemaRoute Test API',
      version:     '1.0.0',
      description: 'Auto-generated API docs for categories and products resources',
      serverUrl:   `http://localhost:${PORT}`,
    })
    mountSwaggerUI(app, spec)

    // ── sdk demo route ─────────────────────────────────────────────────────────
    // demonstrates the SDK consuming its own API — useful for testing
    const api = createSDK(`http://localhost:${PORT}`, [categoriesInstance, productsInstance])

    app.get('/sdk-demo', async (_req, res) => {
      try {
        const categories = await api.categories.getAll({ limit: 3 })
        const products   = await api.products.getAll({ limit: 3, filter: { status: 'active' } })
        res.json({ categories, products })
      } catch (err) {
        res.status(500).json({ error: String(err) })
      }
    })

    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}\n`)
      console.log('Routes:')
      console.log('  GET    /health')
      console.log('  GET    /categories')
      console.log('  GET    /categories/:id')
      console.log('  POST   /categories')
      console.log('  PUT    /categories/:id')
      console.log('  DELETE /categories/:id')
      console.log('  GET    /products')
      console.log('  GET    /products/:id')
      console.log('  POST   /products')
      console.log('  PUT    /products/:id')
      console.log('  DELETE /products/:id')
      console.log('  GET    /products/active       (custom)')
      console.log('  GET    /products/out-of-stock (custom)')
      console.log(`  GET    /api-docs              (swagger)`)
      console.log(`  GET    /sdk-demo              (sdk demo)`)
    })
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message)
    process.exit(1)
  })
