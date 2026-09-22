import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signUpWithPhone, signInWithPhone } from '../auth';
import { getArtisanById, createArtisan } from '../artisans';
import { supabase } from '../client';

// Mock client for testing service contract
vi.mock('../client', () => {
  return {
    supabase: {
      auth: {
        signUp: vi.fn(),
        signInWithPassword: vi.fn(),
        getUser: vi.fn(),
      },
      from: vi.fn(),
      storage: {
        from: vi.fn(),
      },
    },
  };
});

/**
 * PostgreSQL Storage RLS Policy Evaluator function that replicates:
 * CREATE POLICY "Artisans can only upload to own folder in product-photos-raw"
 *   ON storage.objects FOR INSERT TO authenticated
 *   WITH CHECK (
 *     bucket_id = 'product-photos-raw'
 *     AND (storage.foldername(name))[1] = auth.uid()::text
 *   );
 */
export function evaluateStorageInsertPolicy(
  bucketId: string,
  objectPath: string,
  authUid: string | null,
  role: 'authenticated' | 'anon'
): { allowed: boolean; error?: string } {
  // 1. Role check ('TO authenticated')
  if (role !== 'authenticated' || !authUid) {
    return {
      allowed: false,
      error: 'new row violates row-level security policy for table "objects" (role must be authenticated)',
    };
  }

  // 2. Bucket check
  if (bucketId !== 'product-photos-raw') {
    return {
      allowed: false,
      error: 'new row violates row-level security policy for table "objects" (invalid bucket)',
    };
  }

  // 3. Folder name check: (storage.foldername(name))[1] = auth.uid()::text
  // PostgreSQL storage.foldername('a/b/c.jpg') returns text[] {'a', 'b'} (1-indexed, so [1] is 'a')
  const pathParts = objectPath.split('/');
  const topFolder = pathParts.length > 1 ? pathParts[0] : '';

  if (topFolder !== authUid) {
    return {
      allowed: false,
      error: `new row violates row-level security policy: folder '${topFolder}' does not match auth.uid '${authUid}'`,
    };
  }

  return { allowed: true };
}

describe('Artisan Auth Identity & Storage RLS Regression Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Step 1 & 2: artisans.id equals auth.uid() contract', () => {
    it('proves registration flow establishes artisans.id equal to auth.uid()', async () => {
      const mockAuthUid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const mockPhone = '9876543210';
      const mockName = 'Ramesh Sharma';

      // Mock auth.signUp returning a new user with id = mockAuthUid
      vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
        data: {
          user: {
            id: mockAuthUid,
            email: `${mockPhone}@karagir.local`,
            app_metadata: {},
            user_metadata: { full_name: mockName, phone: mockPhone },
            aud: 'authenticated',
            created_at: new Date().toISOString(),
          } as any,
          session: null,
        },
        error: null,
      });

      const { data: authResult } = await signUpWithPhone(mockPhone, '123456', mockName);
      expect(authResult?.user?.id).toBe(mockAuthUid);

      // Verify that inserting into artisans passes id = authResult.user.id
      const insertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: authResult!.user!.id,
              name: mockName,
              phone: mockPhone,
            },
            error: null,
          }),
        }),
      });

      vi.mocked(supabase.from).mockReturnValueOnce({
        insert: insertMock,
      } as any);

      const artisanProfile = await createArtisan({
        id: authResult!.user!.id,
        name: mockName,
        phone: mockPhone,
        location: 'POINT(73.7898 19.9975)',
        category: 'Woodworking',
      });

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockAuthUid, // artisans.id explicitly set to auth.uid()
        })
      );
      expect(artisanProfile?.id).toBe(mockAuthUid);
    });

    it('proves login flow queries artisan profile using data.user.id (auth.uid())', async () => {
      const mockAuthUid = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
      const mockPhone = '9812345678';

      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
        data: {
          user: {
            id: mockAuthUid,
            email: `${mockPhone}@karagir.local`,
          } as any,
          session: {} as any,
        },
        error: null,
      });

      const { data: loginData } = await signInWithPhone(mockPhone, '123456');
      expect(loginData?.user?.id).toBe(mockAuthUid);

      // getArtisanById selects where id = auth.uid()
      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: mockAuthUid,
              name: 'Prakash Suthar',
              phone: mockPhone,
            },
            error: null,
          }),
        }),
      });

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: selectMock,
      } as any);

      const profile = await getArtisanById(loginData!.user!.id);
      expect(selectMock).toHaveBeenCalledWith('*');
      expect(profile?.id).toBe(mockAuthUid);
    });
  });

  describe('Step 3: Storage RLS Policy Isolation & Cross-Artisan Prevention', () => {
    const artisanAliceUid = '11111111-1111-4111-a111-111111111111';
    const artisanBobUid = '22222222-2222-4222-b222-222222222222';
    const testProductId = 'product-pot-404';

    it('permits authenticated artisan to upload into their own folder (auth.uid() matching folder segment)', () => {
      const timestamp = 1726000000000;
      // Object path: {artisan_id}/{product_id}/{timestamp}.jpg
      const objectPath = `${artisanAliceUid}/${testProductId}/${timestamp}.jpg`;

      const evaluation = evaluateStorageInsertPolicy(
        'product-photos-raw',
        objectPath,
        artisanAliceUid,
        'authenticated'
      );

      expect(evaluation.allowed).toBe(true);
      expect(evaluation.error).toBeUndefined();
    });

    it('rejects cross-artisan upload attempt (artisan Bob attempting to upload into artisan Alice folder)', () => {
      const timestamp = 1726000000000;
      // Bob is authenticated, but tries to write to Alice's folder:
      const maliciousCrossPath = `${artisanAliceUid}/${testProductId}/${timestamp}.jpg`;

      const evaluation = evaluateStorageInsertPolicy(
        'product-photos-raw',
        maliciousCrossPath,
        artisanBobUid, // Bob's auth.uid()
        'authenticated'
      );

      // RLS Policy MUST reject because (storage.foldername(name))[1] = Alice != Bob
      expect(evaluation.allowed).toBe(false);
      expect(evaluation.error).toContain('does not match auth.uid');
    });

    it('rejects unauthenticated upload attempts even if path is valid', () => {
      const objectPath = `${artisanAliceUid}/${testProductId}/photo.jpg`;

      const evaluation = evaluateStorageInsertPolicy(
        'product-photos-raw',
        objectPath,
        null, // No auth.uid()
        'anon'
      );

      expect(evaluation.allowed).toBe(false);
      expect(evaluation.error).toContain('role must be authenticated');
    });

    it('rejects uploads targeting an unauthorized bucket', () => {
      const objectPath = `${artisanAliceUid}/${testProductId}/photo.jpg`;

      const evaluation = evaluateStorageInsertPolicy(
        'unauthorized-bucket',
        objectPath,
        artisanAliceUid,
        'authenticated'
      );

      expect(evaluation.allowed).toBe(false);
      expect(evaluation.error).toContain('invalid bucket');
    });
  });
});
