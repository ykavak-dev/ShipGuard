// Test fixture — deliberately vulnerable code for rule testing
// DO NOT import or execute this file

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();

// Overly permissive CORS — no options restricting origin
app.use(cors());

// Weak hashing algorithm for passwords
function hashPassword(password: string): string {
  return crypto.createHash('md5').update(password).digest('hex');
}

// Stack trace leak in error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.status(500).send(err.stack);
});

app.listen(3000);
