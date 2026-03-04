// Test fixture — deliberately vulnerable code for rule testing
// DO NOT import or execute this file

// Hardcoded AWS credentials
const AWS_KEY = 'AKIA_TEST_KEY_DO_NOT_USE_1234567890';
const AWS_SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

// SQL injection via template literal
function getUserById(db: any, id: string) {
  return db.query(`SELECT * FROM users WHERE id = '${id}'`);
}

// XSS via innerHTML
function renderContent(html: string) {
  document.getElementById('app')!.innerHTML = html;
}

// Weak crypto — token generation with Math.random
function generateToken(): string {
  return Math.random().toString(36).substring(2);
}

// Excessive console.log usage
function processOrder(order: any) {
  console.log('Starting order processing');
  console.log('Order ID:', order.id);
  console.log('Order items:', order.items);
  console.log('Validating payment...');
  console.log('Payment validated');
  console.log('Sending confirmation email');
  console.log('Order processing complete');
}
