// scripts/verifyConnection.js
const { getAnonClient } = require("../src/configs/supabaseConfig.js");

/**
 * Script to verify Supabase connection
 * Run with: pnpm run db:verify
 */
async function verifySupabaseConnection() {
  try {
    console.log("Attempting to connect to Supabase...");

    // Get Supabase client
    const supabase = getAnonClient();

    // Simple query to test connection
    const { data, error } = await supabase
      .from("_test_connection")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01") {
        // Table doesn't exist error
        console.log("✅ Connected to Supabase successfully!");
        console.log(
          "Info: The _test_connection table does not exist, but that's expected."
        );
        process.exit(0);
      } else {
        console.error(
          "❌ Connected to Supabase, but query failed:",
          error.message
        );
        process.exit(1);
      }
    } else {
      console.log("✅ Connected to Supabase successfully!");
      console.log("Test query returned:", data || "No data");
      process.exit(0);
    }
  } catch (error) {
    console.error("❌ Failed to connect to Supabase:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

verifySupabaseConnection();
