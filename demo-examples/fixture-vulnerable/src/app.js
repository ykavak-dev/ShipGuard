const AWS_ACCESS_KEY = 'AKIA1234567890ABCDEF';

console.log('Starting service...');
console.log('Loading config...');
console.log('Connecting to database...');
console.log('Database connected');
console.log('Starting HTTP server...');
console.log('Server ready on port 3000');

export function handler(req, res) {
  console.log('Incoming request', req.url);
  res.end('ok');
}
