# schemaroute

Auto-generate CRUD API routes from a Mongoose schema. No boilerplate. No repetition.

## Install

```bash
npm install schemaroute
```

This installs all `@schemaroute` packages in one go:
- `@schemaroute/core` — schema parser, route builder, validation
- `@schemaroute/express` — Express adapter
- `@schemaroute/docs` — OpenAPI 3.0 spec + Swagger UI
- `@schemaroute/sdk` — TypeScript client SDK

## Usage

```js
import { createAPI } from 'schemaroute'
import mongoose from 'mongoose'

const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  age: Number
})

createAPI(app, UserSchema, 'users')
```

Generates:
- `GET    /users`
- `GET    /users/:id`
- `POST   /users`
- `PUT    /users/:id`
- `DELETE /users/:id`

## Individual Packages

If you only need specific functionality, install individual packages:

```bash
npm install @schemaroute/core @schemaroute/express
npm install @schemaroute/docs
npm install @schemaroute/sdk
```

## Links

- [GitHub](https://github.com/Bhushan-Wagh98/schemaroute)
- [@schemaroute/core](https://www.npmjs.com/package/@schemaroute/core)
- [@schemaroute/express](https://www.npmjs.com/package/@schemaroute/express)
- [@schemaroute/docs](https://www.npmjs.com/package/@schemaroute/docs)
- [@schemaroute/sdk](https://www.npmjs.com/package/@schemaroute/sdk)
