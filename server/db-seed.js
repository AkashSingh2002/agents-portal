const { initializeDatabase } = require('./database/init');

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');
    await initializeDatabase();
    console.log('✅ Database seeded successfully!');
    console.log('');
    console.log('📊 Sample data includes:');
    console.log('   • Employees: john@example.com, jane@example.com, mike@example.com (password: password123)');
    console.log('   • Orders with stages and system sizes');
    console.log('   • Payout entries (M1, M2, M3, Clawback)');
    console.log('');
    console.log('🚀 You can now start the application with: npm run dev');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();
