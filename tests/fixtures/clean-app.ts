// Test fixture — clean code that should trigger zero rules
// DO NOT import or execute this file

interface User {
  id: number;
  name: string;
  email: string;
}

function getUserById(id: number): User | undefined {
  const users: User[] = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
  ];
  return users.find((user) => user.id === id);
}

function formatUserName(user: User): string {
  return `${user.name} <${user.email}>`;
}

function calculateTotal(prices: number[]): number {
  return prices.reduce((sum, price) => sum + price, 0);
}

function isValidEmail(email: string): boolean {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

export { getUserById, formatUserName, calculateTotal, isValidEmail };
export type { User };
