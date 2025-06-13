// database/seeds/userSeed.js
"use strict";

// Dynamic import to support ES module environment
async function importDependencies() {
  try {
    let supabaseConfig, logger;
    
    // Try CommonJS require first
    try {
      supabaseConfig = require('../../src/configs/supabaseConfig');
      logger = require('../../src/utils/logger');
    } catch (err) {
      // If that fails, try dynamic import
      const supabaseConfigModule = await import('../../src/configs/supabaseConfig.js');
      const loggerModule = await import('../../src/utils/logger.js');
      
      supabaseConfig = supabaseConfigModule;
      logger = loggerModule;
    }
    
    return {
      getAdminClient: supabaseConfig.getAdminClient,
      colorLogger: logger.colorLogger
    };
  } catch (error) {
    console.error('Failed to import dependencies:', error);
    process.exit(1);
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Seeder configuration
const SEED_USERS = {
  users: [
    {
      email: 'admin@profile.app',
      password: 'Admin123!',
      role: 'ADMIN',
      full_name: 'Admin User',
      age: 30,
      city: 'San Francisco',
      job_title: 'Platform Administrator',
      hobbies: ['Managing Platform', 'Data Analysis', 'User Support'],
      bio: 'Platform administrator with expertise in user management and data analysis.',
      instagram_handle: 'profile_admin',
      linkedin_url: 'https://linkedin.com/in/profile-admin',
      website_url: 'https://profile.app/admin'
    },
    {
      email: 'developer@profile.app',
      password: 'Dev123!',
      role: 'DEVELOPER',
      full_name: 'Dev User',
      age: 28,
      city: 'Austin',
      job_title: 'Senior Developer',
      hobbies: ['Coding', 'Open Source', 'Tech Meetups'],
      bio: 'Senior developer passionate about building scalable applications.',
      instagram_handle: 'dev_profile',
      linkedin_url: 'https://linkedin.com/in/profile-dev'
    },
    {
      email: 'john@example.com',
      password: 'User123!',
      role: 'USER',
      full_name: 'John Smith',
      age: 25,
      city: 'New York',
      job_title: 'Marketing Manager',
      hobbies: ['Photography', 'Hiking', 'Coffee', 'Travel'],
      bio: 'Marketing professional who loves adventure and capturing moments through photography.',
      instagram_handle: 'john_adventures',
      linkedin_url: 'https://linkedin.com/in/johnsmith'
    },
    {
      email: 'mike@example.com',
      password: 'User123!',
      role: 'USER',
      full_name: 'Mike Johnson',
      age: 32,
      city: 'Los Angeles',
      job_title: 'Fitness Coach',
      hobbies: ['Gym', 'Nutrition', 'Basketball', 'Cooking'],
      bio: 'Certified fitness coach helping people achieve their health and wellness goals.',
      instagram_handle: 'mike_fitness',
      website_url: 'https://mikefitness.com'
    },
  ],

  // Pre-generated token codes for testing
  tokenCodes: [
    'ABC123',
    'DEF456',
    'GHI789',
    'JKL012',
    'MNO345',
    'PQR678',
    'STU901',
    'VWX234',
    'YZA567',
    'BCD890'
  ]
};

async function cleanDatabase(supabase, colorLogger) {
  colorLogger.info('Cleaning database...');
  
  try {
    // Clean related tables first (order matters due to foreign keys)
    const tables = [
      'notifications',
      'viewer_responses', 
      'token_activities',
      'tokens',
      'videos',
      'photos'
    ];
    
    for (const table of tables) {
      try {
        const { error } = await supabase
          .from(table)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (error && !error.message.includes('does not exist')) {
          colorLogger.warn(`Error cleaning ${table}: ${error.message}`);
        } else {
          colorLogger.info(`Cleaned table: ${table}`);
        }
      } catch (err) {
        colorLogger.warn(`Failed to clean ${table}: ${err.message}`);
      }
    }

    // Clean auth users first (this will cascade to user_profiles due to FK)
    try {
      colorLogger.info('Cleaning auth users...');
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      if (existingUsers?.users?.length > 0) {
        for (const user of existingUsers.users) {
          const { error } = await supabase.auth.admin.deleteUser(user.id);
          if (error) {
            colorLogger.warn(`Error deleting auth user ${user.email}: ${error.message}`);
          } else {
            colorLogger.info(`Deleted auth user: ${user.email}`);
          }
        }
      }
    } catch (err) {
      colorLogger.warn(`Error cleaning auth users: ${err.message}`);
    }

    // Wait for cascade deletion to complete
    await sleep(3000);
    
    // Verify user_profiles is empty
    const { data: remainingProfiles } = await supabase
      .from('user_profiles')
      .select('id, email');
    
    if (remainingProfiles?.length > 0) {
      colorLogger.info(`Found ${remainingProfiles.length} remaining profiles, cleaning manually...`);
      for (const profile of remainingProfiles) {
        const { error } = await supabase
          .from('user_profiles')
          .delete()
          .eq('id', profile.id);
        if (error) {
          colorLogger.warn(`Error deleting profile ${profile.email}: ${error.message}`);
        }
      }
    }

    colorLogger.success('Database cleaned successfully');
    
  } catch (error) {
    colorLogger.error(`Database cleanup failed: ${error.message}`);
    throw error;
  }
}

async function createTokens(supabase, colorLogger) {
  colorLogger.info('Creating sample tokens...');
  
  try {
    const tokens = SEED_USERS.tokenCodes.map(code => ({
      token_code: code,
      type: 'STANDARD',
      status: 'UNASSIGNED',
      created_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('tokens')
      .insert(tokens)
      .select();

    if (error) throw error;

    colorLogger.success(`Created ${data.length} sample tokens`);
    return data;
  } catch (error) {
    colorLogger.error(`Failed to create tokens: ${error.message}`);
    throw error;
  }
}

async function seedUsers({ getAdminClient, colorLogger }) {
  const supabase = getAdminClient();
  const processed = [];
  const failed = [];
  
  try {
    // 1. Clean the database
    await cleanDatabase(supabase, colorLogger);

    // 2. Process each user
    for (const user of SEED_USERS.users) {
      try {
        colorLogger.info(`\nProcessing ${user.email} (${user.role})...`);
        
        // Create auth user with Supabase Auth
        colorLogger.info(`Creating auth user: ${user.email}`);
        const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
          email: user.email,
          password: user.password,
          email_confirm: true,
          user_metadata: {
            full_name: user.full_name,
            role: user.role  // Include role in metadata
          }
        });

        if (createError) {
          throw new Error(`Auth creation failed: ${createError.message}`);
        }

        const userId = authUser.user.id;
        colorLogger.info(`Auth user created with ID: ${userId}`);

        // Wait for trigger to create the profile
        await sleep(2000);

        // Check if profile was created by trigger
        const { data: existingProfile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (existingProfile) {
          colorLogger.info(`Profile created by trigger, updating with full data...`);
          
          // Update the profile with complete data
          const { data: updatedProfile, error: updateError } = await supabase
            .from('user_profiles')
            .update({
              role: user.role,  // Update the role
              full_name: user.full_name,
              age: user.age,
              city: user.city,
              job_title: user.job_title,
              hobbies: user.hobbies,
              bio: user.bio,
              instagram_handle: user.instagram_handle,
              linkedin_url: user.linkedin_url,
              website_url: user.website_url,
              is_verified: true,
              provider: 'email',
              updated_at: new Date().toISOString()
            })
            .eq('id', userId)
            .select()
            .single();

          if (updateError) {
            throw new Error(`Profile update failed: ${updateError.message}`);
          }

          colorLogger.info(`Profile updated successfully for: ${user.email}`);
        } else {
          colorLogger.info(`No profile found, creating manually...`);
          
          // Create profile manually
          const { data: newProfile, error: profileError } = await supabase
            .from('user_profiles')
            .insert({
              id: userId,
              email: user.email,
              role: user.role,
              full_name: user.full_name,
              age: user.age,
              city: user.city,
              job_title: user.job_title,
              hobbies: user.hobbies,
              bio: user.bio,
              instagram_handle: user.instagram_handle,
              linkedin_url: user.linkedin_url,
              website_url: user.website_url,
              is_verified: true,
              provider: 'email',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single();

          if (profileError) {
            throw new Error(`Profile creation failed: ${profileError.message}`);
          }

          colorLogger.info(`Profile created successfully for: ${user.email}`);
        }

        // Final verification
        const { data: verifyProfile, error: verifyError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (verifyError || !verifyProfile) {
          throw new Error(`Profile verification failed: ${verifyError?.message || 'Profile not found'}`);
        }

        if (verifyProfile.role !== user.role) {
          throw new Error(`Role mismatch: expected ${user.role}, got ${verifyProfile.role}`);
        }

        colorLogger.success(`✅ Successfully processed user: ${user.email} with role: ${verifyProfile.role}`);
        processed.push({ ...user, id: userId });
        await sleep(1000);

      } catch (error) {
        colorLogger.error(`❌ Failed to process ${user.email}: ${error.message}`);
        failed.push({ ...user, error: error.message });
      }
    }

    // 3. Create sample tokens
    try {
      await createTokens(supabase, colorLogger);
    } catch (error) {
      colorLogger.warn(`Token creation failed: ${error.message}`);
    }

    // 4. Final verification
    colorLogger.info('\n======= FINAL VERIFICATION =======');
    
    const { data: finalUsers } = await supabase
      .from('user_profiles')
      .select('email, role, full_name, created_at')
      .order('created_at', { ascending: true });
    
    colorLogger.info(`Total users in database: ${finalUsers?.length || 0}`);
    
    if (finalUsers?.length > 0) {
      finalUsers.forEach(user => {
        colorLogger.info(`  • ${user.email} (${user.role}) - ${user.full_name}`);
      });
    }

    // Check auth users
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    colorLogger.info(`Total auth users: ${authUsers?.users?.length || 0}`);

    // Check tokens
    const { data: finalTokens } = await supabase
      .from('tokens')
      .select('token_code, status');
    
    colorLogger.info(`Total tokens in database: ${finalTokens?.length || 0}`);

    // Summary
    colorLogger.info('\n=== Seeding Summary ===');
    colorLogger.success(`Successfully processed: ${processed.length}`);
    colorLogger.error(`Failed: ${failed.length}`);

    if (failed.length > 0) {
      colorLogger.error('\nFailed users:');
      failed.forEach(user => {
        colorLogger.error(`  ✗ ${user.email} (${user.role}): ${user.error}`);
      });
    }

    if (processed.length > 0) {
      colorLogger.success('\nSuccessfully created users:');
      processed.forEach(user => {
        colorLogger.success(`  ✓ ${user.email} (${user.role})`);
      });
    }

    return { success: processed.length > 0, processed, failed };

  } catch (error) {
    colorLogger.error(`Seeding failed: ${error.message}`);
    return { success: false, processed, failed };
  }
}

// Main execution
async function main() {
  try {
    const dependencies = await importDependencies();
    const result = await seedUsers(dependencies);
    
    if (result.success) {
      dependencies.colorLogger.success('\n🎉 Seeding completed successfully!');
      dependencies.colorLogger.info('You can now test the application with the seeded users.');
      dependencies.colorLogger.info('\nLogin credentials:');
      SEED_USERS.users.forEach(user => {
        dependencies.colorLogger.info(`  • ${user.email} / ${user.password} (${user.role})`);
      });
      process.exit(0);
    } else {
      dependencies.colorLogger.error('\n❌ Seeding completed with errors');
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Seeding failed: ${error.message}`);
    process.exit(1);
  }
}

// Check if run directly
const isRunDirectly = !module.parent || (typeof __filename !== 'undefined' && process.argv[1] === __filename);
if (isRunDirectly) {
  main();
}

// Export for CommonJS
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = seedUsers;
}

// Export for ES modules
if (typeof exports !== 'undefined') {
  exports.__esModule = true;
  exports.default = seedUsers;
}