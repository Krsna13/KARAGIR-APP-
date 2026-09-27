import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Load environment variables from .env
function loadEnv(): void {
  const envPath = path.join(projectRoot, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

console.log('=== Stage 6.3z: Live Verification Against Remote Supabase ===');
console.log(`Connecting to: ${supabaseUrl}`);

async function main() {

  // 1. Create client instances
  const buyerClient = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: { persistSession: false },
  });

  const clientA = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: { persistSession: false },
  });

  const clientB = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: { persistSession: false },
  });

  console.log('\n--- 1. Authenticating Real Test Accounts against Live Supabase Project ---');
  const emailA = 'artisan_a_stage63z@karagir.live';
  const emailB = 'artisan_b_stage63z@karagir.live';
  const password = 'Stage63zPass!';

  console.log(`Artisan A: ${emailA}`);
  const { data: signInDataA, error: errSignInA } = await clientA.auth.signInWithPassword({
    email: emailA,
    password,
  });

  if (errSignInA || !signInDataA.user) {
    throw new Error(`Failed to sign in Artisan A: ${errSignInA?.message}`);
  }
  const userA = signInDataA.user;
  console.log(`✓ Artisan A authenticated. UID: ${userA.id}, Session Access Token: present`);

  console.log(`Artisan B: ${emailB}`);
  const { data: signInDataB, error: errSignInB } = await clientB.auth.signInWithPassword({
    email: emailB,
    password,
  });

  if (errSignInB || !signInDataB.user) {
    throw new Error(`Failed to sign in Artisan B: ${errSignInB?.message}`);
  }
  const userB = signInDataB.user;
  console.log(`✓ Artisan B authenticated. UID: ${userB.id}, Session Access Token: present`);

  const testProductId = crypto.randomUUID();
  const testImageId = crypto.randomUUID();

  console.log('\n--- 2. Artisan A Creates Draft Product with Photos ---');
  console.log(`Product ID: ${testProductId}`);
  console.log(`Image ID: ${testImageId}`);

  // Insert draft product
  const { data: prodA, error: errProdA } = await clientA
    .from('products')
    .insert({
      id: testProductId,
      artisan_id: userA.id,
      title_en: 'Handmade Terracotta Water Pitcher',
      listing_status: 'draft',
      wizard_step: 1,
      photo_background: 'white',
    })
    .select()
    .single();

  if (errProdA) {
    throw new Error(`Artisan A product insert failed: ${errProdA.message}`);
  }
  console.log(`✓ Draft product inserted by Artisan A: title_en="${prodA.title_en}", status="${prodA.listing_status}"`);

  // Insert photo for draft product
  const { data: imgA, error: errImgA } = await clientA
    .from('product_images')
    .insert({
      id: testImageId,
      product_id: testProductId,
      artisan_id: userA.id,
      position: 0,
      is_cover: true,
      original_image_url: `https://fake.storage/product-photos-raw/${userA.id}/${testProductId}/${testImageId}/raw.jpg`,
      image_processing_status: 'pending',
    })
    .select()
    .single();

  if (errImgA) {
    throw new Error(`Artisan A photo insert failed: ${errImgA.message}`);
  }
  console.log(`✓ Product image inserted by Artisan A: id=${imgA.id}, status="${imgA.image_processing_status}"`);

  console.log('\n--- 3. Verifying Draft Invisibility to Anonymous/Buyer Session ---');
  console.log(`Query: SELECT id, title_en, listing_status FROM products WHERE id = '${testProductId}' (as anonymous buyer)`);
  const { data: buyerProdResult, error: buyerProdErr } = await buyerClient
    .from('products')
    .select('id, title_en, listing_status')
    .eq('id', testProductId);

  console.log('Result:', JSON.stringify(buyerProdResult), 'Error:', buyerProdErr);
  if (buyerProdResult && buyerProdResult.length === 0) {
    console.log('✓ PASS: Draft product is strictly INVISIBLE to buyer (0 rows returned).');
  } else {
    throw new Error(`FAIL: Draft product leaked to buyer! Returned: ${JSON.stringify(buyerProdResult)}`);
  }

  console.log(`Query: SELECT * FROM product_images WHERE id = '${testImageId}' (as anonymous buyer)`);
  const { data: buyerImgResult, error: buyerImgErr } = await buyerClient
    .from('product_images')
    .select('id, product_id, is_cover')
    .eq('id', testImageId);

  console.log('Result:', JSON.stringify(buyerImgResult), 'Error:', buyerImgErr);
  if (buyerImgResult && buyerImgResult.length === 0) {
    console.log('✓ PASS: Draft photo is strictly INVISIBLE to buyer (0 rows returned).');
  } else {
    throw new Error(`FAIL: Draft photo leaked to buyer! Returned: ${JSON.stringify(buyerImgResult)}`);
  }

  console.log('\n--- 4. Verifying Cross-Artisan RLS Protection (Artisan B vs Artisan A) ---');
  console.log(`Attempt: Artisan B tries to UPDATE Artisan A's photo (${testImageId})`);
  const { data: updateBResult, error: updateBErr } = await clientB
    .from('product_images')
    .update({ final_image_choice: 'original' })
    .eq('id', testImageId)
    .select();

  console.log('Update result:', JSON.stringify(updateBResult), 'Error:', updateBErr);
  if (!updateBResult || updateBResult.length === 0) {
    console.log('✓ PASS: Artisan B UPDATE was rejected by RLS (0 rows updated).');
  } else {
    throw new Error(`FAIL: Artisan B successfully updated Artisan A's photo!`);
  }

  console.log(`Attempt: Artisan B tries to DELETE Artisan A's photo (${testImageId})`);
  const { data: deleteBResult, error: deleteBErr } = await clientB
    .from('product_images')
    .delete()
    .eq('id', testImageId)
    .select();

  console.log('Delete result:', JSON.stringify(deleteBResult), 'Error:', deleteBErr);
  if (!deleteBResult || deleteBResult.length === 0) {
    console.log('✓ PASS: Artisan B DELETE was rejected by RLS (0 rows deleted).');
  } else {
    throw new Error(`FAIL: Artisan B successfully deleted Artisan A's photo!`);
  }

  // Confirm photo still exists intact
  const { data: verifyA } = await clientA
    .from('product_images')
    .select('id, final_image_choice')
    .eq('id', testImageId)
    .single();

  console.log(`✓ Verified Artisan A's photo is untouched: choice=${verifyA?.final_image_choice ?? 'null'}`);

  console.log('\n--- 5. Artisan A Publishes Product & Confirms Buyer Visibility ---');
  console.log(`Artisan A publishes product with required fields (item_type, material, price)...`);
  const { data: pubProd, error: pubErr } = await clientA
    .from('products')
    .update({
      listing_status: 'published',
      item_type: 'Pitcher',
      material: 'Terracotta Clay',
      price: 650,
    })
    .eq('id', testProductId)
    .select('id, title_en, listing_status, item_type, material, price')
    .single();

  if (pubErr) {
    throw new Error(`Publish failed: ${pubErr.message}`);
  }
  console.log(`✓ Product published: id=${pubProd.id}, status="${pubProd.listing_status}", price=₹${pubProd.price}`);

  console.log(`Query: SELECT id, title_en, listing_status, item_type, material, price FROM products WHERE id = '${testProductId}' (as anonymous buyer)`);
  const { data: buyerPublishedProd, error: errBuyerPub } = await buyerClient
    .from('products')
    .select('id, title_en, listing_status, item_type, material, price')
    .eq('id', testProductId)
    .single();

  console.log('Buyer Product Result:', JSON.stringify(buyerPublishedProd), 'Error:', errBuyerPub);
  if (buyerPublishedProd && buyerPublishedProd.listing_status === 'published') {
    console.log(`✓ PASS: Published product is now VISIBLE to buyer.`);
  } else {
    throw new Error(`FAIL: Published product is not visible to buyer!`);
  }

  console.log(`Query: SELECT * FROM product_images WHERE id = '${testImageId}' (as anonymous buyer)`);
  const { data: buyerPublishedImg, error: errBuyerImg } = await buyerClient
    .from('product_images')
    .select('id, product_id, is_cover, original_image_url')
    .eq('id', testImageId)
    .single();

  console.log('Buyer Image Result:', JSON.stringify(buyerPublishedImg), 'Error:', errBuyerImg);
  if (buyerPublishedImg && buyerPublishedImg.id === testImageId) {
    console.log(`✓ PASS: Published product photo is now VISIBLE to buyer.`);
  } else {
    throw new Error(`FAIL: Published product photo is not visible to buyer!`);
  }

  console.log('\n--- 6. Cleanup Test Data ---');
  const { error: delProdErr } = await clientA
    .from('products')
    .delete()
    .eq('id', testProductId);

  if (delProdErr) {
    console.warn('Cleanup warning (product):', delProdErr.message);
  } else {
    console.log('✓ Test product deleted (cascaded to product_images).');
  }

  console.log('\n=== ALL LIVE RLS VERIFICATIONS PASSED SUCCESSFULLY ===');
}

main().catch((err) => {
  console.error('\n❌ Live Verification Failed:', err);
  process.exit(1);
});
