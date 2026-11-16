import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createGoppoApp, type GoppoAppOptions } from '../server.ts';
import { verifyFirebaseIdToken, type VerifiedFirebaseToken } from '../server/firebaseAuth.ts';

process.env.GOPPO_NO_AUTOSTART = 'true';
process.env.GOPPO_DISABLE_CLOUD_METADATA = 'true';
process.env.OWNER_ADMIN_EMAILS =
  process.env.OWNER_ADMIN_EMAILS || 'joydas.21071997@gmail.com';

const MOCK_TOKENS: Record<string, VerifiedFirebaseToken> = {
  'tok.owner.jwt': {
    uid: 'uid_owner_001',
    email: 'joydas.21071997@gmail.com',
    emailVerified: true,
    name: 'Joy Das (Owner)',
  },
  'tok.editormedia.jwt': {
    uid: 'uid_editor_media',
    email: 'mediaeditor@goppokahini.in',
    emailVerified: true,
    name: 'Media Editor',
  },
  'tok.editorstory.jwt': {
    uid: 'uid_editor_story',
    email: 'storyeditor@goppokahini.in',
    emailVerified: true,
    name: 'Story Only Editor',
  },
  'tok.alice.jwt': {
    uid: 'uid_alice_001',
    email: 'alice@example.com',
    emailVerified: true,
    name: 'Alice Listener',
  },
  'tok.bob.jwt': {
    uid: 'uid_bob_002',
    email: 'bob@example.com',
    emailVerified: true,
    name: 'Bob Listener',
    signInProvider: 'google.com',
  },
  'tok.emailverified.jwt': {
    uid: 'uid_email_ver_003',
    email: 'charlie@example.com',
    emailVerified: true,
    name: 'Charlie Reader',
    signInProvider: 'password',
  },
  'tok.emailunverified.jwt': {
    uid: 'uid_attacker_unverified',
    email: 'joydas.21071997@gmail.com',
    emailVerified: false,
    name: 'Fake Owner',
    signInProvider: 'password',
  },
};

function makeMinimalMp3Buffer(): Buffer {
  // Valid ID3v2 header + padding
  return Buffer.concat([
    Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x0a', 'binary'),
    Buffer.from('GOPPO_AUDIO_TEST_FRAME_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
  ]);
}

function makeMinimalMp4Buffer(): Buffer {
  // Valid ISO BMFF ftyp box
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftypisom', 'ascii'),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from('isomiso2mp41GOPPO_VIDEO_PAYLOAD_0123456789'),
  ]);
}

function makeMinimalPngBuffer(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
    Buffer.from('GOPPO_PNG_ARTWORK_TEST'),
  ]);
}

async function withServer(
  opts: GoppoAppOptions,
  fn: (baseUrl: string, serverDataDir: string) => Promise<void>,
) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goppo-sec-test-'));
  const { app } = createGoppoApp({
    dataDir: tempDir,
    skipCloudHydration: true,
    disableLiveFirebaseAdmin: true,
    verifyTokenImpl: async (tok: string) => MOCK_TOKENS[tok] || null,
    ...opts,
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await fn(baseUrl, tempDir);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function runTests() {
  const results: string[] = [];
  const record = (name: string) => {
    results.push(`PASS: ${name}`);
  };

  // =========================================================================
  // SUITE 1: Production RBAC, Media Hardening, Free vs Premium Access, Auth
  // =========================================================================
  await withServer(
    {
      isProductionOverride: true,
      allowSandboxOverride: false,
      paymentGatewayOverride: { enabled: false },
    },
    async (baseUrl, dataDir) => {
      // 1. Seed two editors via Owner Admin
      const bootstrapOwner = await fetch(`${baseUrl}/api/auth/firebase`, {
        method: 'POST',
        headers: { Authorization: 'Bearer tok.owner.jwt' },
      });
      assert.equal(bootstrapOwner.status, 200);
      const ownerPayload = await bootstrapOwner.json();
      assert.equal(ownerPayload.user.role, 'admin');

      const grantMediaEditor = await fetch(`${baseUrl}/api/admin/editors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          email: 'mediaeditor@goppokahini.in',
          name: 'Media Editor',
          uid: 'uid_editor_media',
          permissions: ['manage_stories', 'manage_media'],
        }),
      });
      assert.equal(grantMediaEditor.status, 200);

      const grantStoryOnlyEditor = await fetch(`${baseUrl}/api/admin/editors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          email: 'storyeditor@goppokahini.in',
          name: 'Story Only Editor',
          uid: 'uid_editor_story',
          permissions: ['manage_stories'],
        }),
      });
      assert.equal(grantStoryOnlyEditor.status, 200);
      record('1. Owner/Admin Firebase session & Editor RBAC provisioning');

      // 2. Passwordless /api/auth/login cannot hijack Firebase-linked or Staff accounts
      const hijackOwner = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'joydas.21071997@gmail.com' }),
      });
      assert.equal(hijackOwner.status, 403);

      // Register Alice via Firebase Auth first, then attempt passwordless login takeover
      const aliceAuth = await fetch(`${baseUrl}/api/auth/firebase`, {
        method: 'POST',
        headers: { Authorization: 'Bearer tok.alice.jwt' },
      });
      assert.equal(aliceAuth.status, 200);

      const hijackAlice = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com' }),
      });
      assert.equal(hijackAlice.status, 403);
      record('2. Passwordless /api/auth/login blocked from impersonating Staff or Firebase users');

      // 3. Regular user / unauthenticated / story-only editor denied media upload
      const mp3B64 = makeMinimalMp3Buffer().toString('base64');
      const unauthUpload = await fetch(`${baseUrl}/api/admin/upload-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData: mp3B64, fileName: 'ep.mp3', mediaType: 'audio' }),
      });
      assert.equal(unauthUpload.status, 401);

      const userUpload = await fetch(`${baseUrl}/api/admin/upload-media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.alice.jwt',
        },
        body: JSON.stringify({ fileData: mp3B64, fileName: 'ep.mp3', mediaType: 'audio' }),
      });
      assert.equal(userUpload.status, 403);

      const storyOnlyUpload = await fetch(`${baseUrl}/api/admin/upload-media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.editorstory.jwt',
        },
        body: JSON.stringify({ fileData: mp3B64, fileName: 'ep.mp3', mediaType: 'audio' }),
      });
      assert.equal(storyOnlyUpload.status, 403);

      // Story-only editor without manage_hero cannot hijack isFeaturedHero
      const heroEscalationRes = await fetch(`${baseUrl}/api/admin/stories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.editorstory.jwt',
        },
        body: JSON.stringify({
          id: 'bn-editor-test',
          language: 'bn',
          category: 'audio',
          title: 'Editor Story Test',
          genre: 'Mystery',
          synopsis: 'Test',
          isFeaturedHero: true,
          publicationStatus: 'draft',
          episodes: [{ id: 'ed-ep1', title: 'Ep 1', durationLabel: '10:00', synopsis: 'Ep 1' }],
        }),
      });
      assert.equal(heroEscalationRes.status, 200);
      const heroEscalationBody = await heroEscalationRes.json();
      const createdByEditor = heroEscalationBody.stories.find((s: any) => s.id === 'bn-editor-test');
      assert.equal(createdByEditor.isFeaturedHero, false);
      record('3. Upload endpoint denies unauthenticated, listener, and non-media Editor; manage_hero privilege preserved');

      // 4. Malicious MIME, SVG/HTML, spoofed MP3 magic bytes, and oversized files rejected
      const svgPayload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
      const svgUpload = await fetch(`${baseUrl}/api/admin/upload-media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          fileData: `data:image/svg+xml;base64,${svgPayload}`,
          fileName: 'evil.svg',
          mediaType: 'image',
        }),
      });
      assert.equal(svgUpload.status, 400);

      const spoofedMp3 = await fetch(`${baseUrl}/api/admin/upload-media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          fileData: Buffer.from('<html onload="alert(1)">not mp3</html>').toString('base64'),
          fileName: 'fake_audio.mp3',
          mediaType: 'audio',
        }),
      });
      assert.equal(spoofedMp3.status, 400);

      const oversizedInit = await fetch(`${baseUrl}/api/admin/upload-media/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          fileName: 'huge_cover.png',
          fileSize: 11 * 1024 * 1024,
          mediaType: 'image',
          mimeType: 'image/png',
        }),
      });
      assert.equal(oversizedInit.status, 413);
      record('4. Magic-byte verification, SVG/HTML rejection, and file-size enforcement');

      // 5. Authorized Editor (manage_media) uploads via chunked upload & Owner uploads via single upload
      const mp4Buf = makeMinimalMp4Buffer();
      const initRes = await fetch(`${baseUrl}/api/admin/upload-media/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.editormedia.jwt',
        },
        body: JSON.stringify({
          fileName: 'premium_episode.mp4',
          fileSize: mp4Buf.length,
          mediaType: 'video',
          mimeType: 'video/mp4',
          accessTier: 'premium',
        }),
      });
      assert.equal(initRes.status, 200);
      const { uploadId } = await initRes.json();

      const chunkRes = await fetch(`${baseUrl}/api/admin/upload-media/chunk/${uploadId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          Authorization: 'Bearer tok.editormedia.jwt',
        },
        body: new Uint8Array(mp4Buf),
      });
      assert.equal(chunkRes.status, 200);

      const completeRes = await fetch(`${baseUrl}/api/admin/upload-media/complete/${uploadId}`, {
        method: 'POST',
        headers: { Authorization: 'Bearer tok.editormedia.jwt' },
      });
      assert.equal(completeRes.status, 200);
      const premVideoData = await completeRes.json();
      assert.ok(premVideoData.url.startsWith('/api/uploads/prem_'));
      assert.ok(premVideoData.previewUrl.includes('?mt='));

      // Also upload a free artwork PNG + free trailer MP3 + free episode MP3
      const pngUpRes = await fetch(`${baseUrl}/api/admin/upload-media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          fileData: makeMinimalPngBuffer().toString('base64'),
          fileName: 'poster.png',
          mediaType: 'image',
          accessTier: 'free',
        }),
      });
      assert.equal(pngUpRes.status, 200);
      const pngUp = await pngUpRes.json();

      const freeEpUpRes = await fetch(`${baseUrl}/api/admin/upload-media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          fileData: mp3B64,
          fileName: 'free_story_ep1.mp3',
          mediaType: 'audio',
          accessTier: 'free',
        }),
      });
      assert.equal(freeEpUpRes.status, 200);
      const freeEpUp = await freeEpUpRes.json();

      const trailerUpRes = await fetch(`${baseUrl}/api/admin/upload-media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          fileData: mp3B64,
          fileName: 'trailer_clip.mp3',
          mediaType: 'audio',
          accessTier: 'free',
        }),
      });
      assert.equal(trailerUpRes.status, 200);
      const trailerUp = await trailerUpRes.json();

      // Non-overwrite check: uploading same filename twice creates distinct paths
      const duplicateUpRes = await fetch(`${baseUrl}/api/admin/upload-media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          fileData: mp3B64,
          fileName: 'trailer_clip.mp3',
          mediaType: 'audio',
          accessTier: 'free',
        }),
      });
      assert.equal(duplicateUpRes.status, 200);
      const duplicateUp = await duplicateUpRes.json();
      assert.notEqual(duplicateUp.url, trailerUp.url);
      record('5. Chunked resumable upload (Editor manage_media), non-overwrite uniqueness');

      // 6. Create both a FREE story and a PREMIUM story
      const saveFreeStory = await fetch(`${baseUrl}/api/admin/stories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          id: 'bn-free-test',
          language: 'bn',
          category: 'audio',
          title: 'Free Folk Story',
          genre: 'Folk',
          synopsis: 'Public free audio story.',
          coverArt: pngUp.url,
          trailerAudioUrl: trailerUp.url,
          ticketPriceInr: 0,
          publicationStatus: 'published',
          episodes: [
            {
              id: 'bn-free-test-ep1',
              number: 1,
              title: 'Free Ep 1',
              durationLabel: '05:00',
              audioUrl: freeEpUp.url,
              synopsis: 'Public episode',
            },
          ],
        }),
      });
      assert.equal(saveFreeStory.status, 200);

      const savePremStory = await fetch(`${baseUrl}/api/admin/stories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          id: 'bn-prem-test',
          language: 'bn',
          category: 'films',
          mediaType: 'video',
          title: 'Premium Mystery Film',
          genre: 'Mystery',
          synopsis: 'Paid film.',
          coverArt: pngUp.url,
          trailerAudioUrl: trailerUp.url,
          ticketPriceInr: 9,
          accessPolicy: 'both',
          publicationStatus: 'published',
          episodes: [
            {
              id: 'bn-prem-test-ep1',
              number: 1,
              title: 'Premium Ep 1',
              durationLabel: '22:00',
              videoUrl: premVideoData.url,
              synopsis: 'Paid episode',
            },
          ],
        }),
      });
      assert.equal(savePremStory.status, 200);
      record('6. Published Free & Premium stories created cleanly');

      // 7. Path traversal rejection & Free public playback preserved
      const traversalRes = await fetch(`${baseUrl}/api/uploads/..%2fplatform-state-v2.json`);
      assert.equal(traversalRes.status, 400);

      const publicArtRes = await fetch(`${baseUrl}${pngUp.url}`);
      assert.equal(publicArtRes.status, 200);
      assert.equal(publicArtRes.headers.get('x-content-type-options'), 'nosniff');

      const publicFreeEpRes = await fetch(`${baseUrl}${freeEpUp.url}`);
      assert.equal(publicFreeEpRes.status, 200);

      const publicTrailerRes = await fetch(`${baseUrl}${trailerUp.url}`);
      assert.equal(publicTrailerRes.status, 200);

      const synthTrailerRes = await fetch(`${baseUrl}/api/audio/bn-zamindar-bari/trailer/trailer.wav`);
      assert.equal(synthTrailerRes.status, 200);
      record('7. Path traversal blocked; Free stories, Trailers, and Artwork remain publicly accessible');

      // 8. Premium exposure audit on /api/bootstrap & direct media URL blocking
      const guestBootstrap = await (await fetch(`${baseUrl}/api/bootstrap`)).json();
      assert.equal(guestBootstrap.sandboxModeEnabled, false);
      const guestPrem = guestBootstrap.stories.find((s: any) => s.id === 'bn-prem-test');
      assert.equal(guestPrem.episodes[0].videoUrl, undefined);
      assert.equal(guestPrem.episodes[0].audioUrl, undefined);
      assert.ok(guestPrem.trailerAudioUrl); // Trailer stays public!

      const guestDirectPrem = await fetch(`${baseUrl}${premVideoData.url}`);
      assert.equal(guestDirectPrem.status, 401);

      const aliceDirectPrem = await fetch(`${baseUrl}${premVideoData.url}`, {
        headers: { Authorization: 'Bearer tok.alice.jwt' },
      });
      assert.equal(aliceDirectPrem.status, 403);

      const aliceAuthMedia = await fetch(`${baseUrl}/api/media/authorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.alice.jwt',
        },
        body: JSON.stringify({
          storyId: 'bn-prem-test',
          episodeId: 'bn-prem-test-ep1',
          mediaKind: 'video',
        }),
      });
      assert.equal(aliceAuthMedia.status, 403);

      const tamperedMtRes = await fetch(`${baseUrl}${premVideoData.url}?mt=invalid.tampered`);
      assert.equal(tamperedMtRes.status, 401);

      const synthEpGuest = await fetch(`${baseUrl}/api/audio/bn-zamindar-bari/episode/bn-zb-ep1.wav`);
      assert.equal(synthEpGuest.status, 401);
      record('8. Premium URLs redacted for guests & direct unauthorized streaming denied (401/403)');

      // 9. Production payment hardening: sandbox disabled & unconfigured gateway returns 503
      const createOrderRes = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.alice.jwt',
        },
        body: JSON.stringify({ itemType: 'story_ticket', storyId: 'bn-prem-test' }),
      });
      assert.equal(createOrderRes.status, 200);
      const { order, sandboxModeEnabled } = await createOrderRes.json();
      assert.equal(sandboxModeEnabled, false);

      const prodSandboxRes = await fetch(`${baseUrl}/api/orders/${order.orderId}/sandbox-verify`, {
        method: 'POST',
        headers: { Authorization: 'Bearer tok.alice.jwt' },
      });
      assert.equal(prodSandboxRes.status, 403);
      const prodSandboxBody = await prodSandboxRes.json();
      assert.equal(prodSandboxBody.reason, 'SANDBOX_DISABLED');

      const prodVerifyNoGateway = await fetch(`${baseUrl}/api/orders/${order.orderId}/verify`, {
        method: 'POST',
        headers: { Authorization: 'Bearer tok.alice.jwt' },
      });
      assert.equal(prodVerifyNoGateway.status, 503);

      // Verify Alice still has zero entitlement
      const aliceStillBlocked = await fetch(`${baseUrl}${premVideoData.url}`, {
        headers: { Authorization: 'Bearer tok.alice.jwt' },
      });
      assert.equal(aliceStillBlocked.status, 403);
      assert.ok(fs.existsSync(path.join(dataDir, 'media-manifest.json')));
      record('9. Production disables sandbox verification (403) & fails closed without gateway keys (503)');
    },
  );

  // =========================================================================
  // SUITE 2: Signed Gateway Verification, Replay/Idempotency, Signed Streaming
  // =========================================================================
  const TEST_KEY_SECRET = 'test_rzp_secret_abcdef1234567890';
  const TEST_WEBHOOK_SECRET = 'test_webhook_secret_xyz987654321';

  await withServer(
    {
      isProductionOverride: true,
      allowSandboxOverride: false,
      paymentGatewayOverride: {
        enabled: true,
        keyId: 'rzp_test_liveid',
        keySecret: TEST_KEY_SECRET,
        webhookSecret: TEST_WEBHOOK_SECRET,
      },
    },
    async (baseUrl) => {
      // Upload a premium MP4 as Owner
      const mp4Buf = makeMinimalMp4Buffer();
      const upRes = await fetch(`${baseUrl}/api/admin/upload-media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          fileData: mp4Buf.toString('base64'),
          fileName: 'vip_cinema.mp4',
          mediaType: 'video',
          accessTier: 'premium',
        }),
      });
      assert.equal(upRes.status, 200);
      const { url: premUrl } = await upRes.json();

      await fetch(`${baseUrl}/api/admin/stories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          id: 'bn-vip-story',
          language: 'bn',
          category: 'films',
          mediaType: 'video',
          title: 'VIP Story',
          genre: 'Thriller',
          synopsis: 'Paid story',
          ticketPriceInr: 9,
          accessPolicy: 'both',
          publicationStatus: 'published',
          episodes: [
            {
              id: 'bn-vip-ep1',
              number: 1,
              title: 'VIP Ep 1',
              durationLabel: '18:00',
              videoUrl: premUrl,
              synopsis: 'VIP Ep 1',
            },
          ],
        }),
      });

      // Bob creates order
      const bobOrderRes = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.bob.jwt',
        },
        body: JSON.stringify({ itemType: 'story_ticket', storyId: 'bn-vip-story' }),
      });
      const { order: bobOrder } = await bobOrderRes.json();

      // Tampered signature rejected
      const badSigRes = await fetch(`${baseUrl}/api/orders/${bobOrder.orderId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.bob.jwt',
        },
        body: JSON.stringify({
          gatewayPaymentId: 'pay_test_001',
          signature: '0'.repeat(64),
          currency: 'INR',
          amountInr: 9,
        }),
      });
      assert.equal(badSigRes.status, 400);

      // Re-create order after failed attempt, test wrong amount rejection, then valid HMAC verification
      const bobOrder2Res = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.bob.jwt',
        },
        body: JSON.stringify({ itemType: 'story_ticket', storyId: 'bn-vip-story' }),
      });
      const { order: bobOrder2 } = await bobOrder2Res.json();
      const validPaymentId = 'pay_valid_999';
      const validSig = crypto
        .createHmac('sha256', TEST_KEY_SECRET)
        .update(`${bobOrder2.orderId}|${validPaymentId}`)
        .digest('hex');

      const wrongAmountRes = await fetch(`${baseUrl}/api/orders/${bobOrder2.orderId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.bob.jwt',
        },
        body: JSON.stringify({
          gatewayPaymentId: validPaymentId,
          signature: validSig,
          currency: 'INR',
          amountInr: 1,
        }),
      });
      assert.equal(wrongAmountRes.status, 400);

      const bobOrder3Res = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.bob.jwt',
        },
        body: JSON.stringify({ itemType: 'story_ticket', storyId: 'bn-vip-story' }),
      });
      const { order: bobOrder3 } = await bobOrder3Res.json();
      const validSig3 = crypto
        .createHmac('sha256', TEST_KEY_SECRET)
        .update(`${bobOrder3.orderId}|${validPaymentId}`)
        .digest('hex');

      const goodVerifyRes = await fetch(`${baseUrl}/api/orders/${bobOrder3.orderId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.bob.jwt',
        },
        body: JSON.stringify({
          gatewayPaymentId: validPaymentId,
          signature: validSig3,
          currency: 'INR',
          amountInr: 9,
        }),
      });
      assert.equal(goodVerifyRes.status, 200);
      const verifiedData = await goodVerifyRes.json();
      assert.equal(verifiedData.verified, true);
      assert.equal(verifiedData.user.storyEntitlements['bn-vip-story'].remainingListens, 2);

      // Idempotency: re-calling /verify on same order MUST NOT increment remainingListens > 2
      const replayOrderRes = await fetch(`${baseUrl}/api/orders/${bobOrder3.orderId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.bob.jwt',
        },
        body: JSON.stringify({
          gatewayPaymentId: validPaymentId,
          signature: validSig3,
          currency: 'INR',
          amountInr: 9,
        }),
      });
      assert.equal(replayOrderRes.status, 200);
      const replayOrderBody = await replayOrderRes.json();
      assert.equal(replayOrderBody.alreadyVerified, true);
      assert.equal(replayOrderBody.user.storyEntitlements['bn-vip-story'].remainingListens, 2);

      // Replay prevention: reusing validPaymentId on a brand-new order must fail 409
      const bobOrder4Res = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.bob.jwt',
        },
        body: JSON.stringify({ itemType: 'story_ticket', storyId: 'bn-vip-story' }),
      });
      const { order: bobOrder4 } = await bobOrder4Res.json();
      const validSig4 = crypto
        .createHmac('sha256', TEST_KEY_SECRET)
        .update(`${bobOrder4.orderId}|${validPaymentId}`)
        .digest('hex');
      const dupPayRes = await fetch(`${baseUrl}/api/orders/${bobOrder4.orderId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.bob.jwt',
        },
        body: JSON.stringify({
          gatewayPaymentId: validPaymentId,
          signature: validSig4,
          currency: 'INR',
          amountInr: 9,
        }),
      });
      assert.equal(dupPayRes.status, 409);

      // Webhook HMAC test (invalid vs valid)
      const webhookPayload = JSON.stringify({
        orderId: bobOrder4.orderId,
        gatewayPaymentId: 'pay_webhook_777',
        currency: 'INR',
        amountInr: 9,
      });
      const badWebhook = await fetch(`${baseUrl}/api/orders/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gateway-signature': 'deadbeef',
        },
        body: webhookPayload,
      });
      assert.equal(badWebhook.status, 401);

      const goodWebhookSig = crypto
        .createHmac('sha256', TEST_WEBHOOK_SECRET)
        .update(webhookPayload)
        .digest('hex');
      const goodWebhook = await fetch(`${baseUrl}/api/orders/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gateway-signature': goodWebhookSig,
        },
        body: webhookPayload,
      });
      assert.equal(goodWebhook.status, 200);
      record('10. Gateway HMAC signature, amount check, idempotency, payment replay guard & webhook');

      // 11. Entitled user obtains signed media URL via /api/media/authorize & streams with Range 206
      const authStreamRes = await fetch(`${baseUrl}/api/media/authorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.bob.jwt',
        },
        body: JSON.stringify({
          storyId: 'bn-vip-story',
          episodeId: 'bn-vip-ep1',
          mediaKind: 'video',
        }),
      });
      assert.equal(authStreamRes.status, 200);
      const { streamUrl } = await authStreamRes.json();
      assert.ok(streamUrl.includes('?mt='));

      const signedRangeRes = await fetch(`${baseUrl}${streamUrl}`, {
        headers: { Range: 'bytes=0-15' },
      });
      assert.equal(signedRangeRes.status, 206);
      const streamedChunk = Buffer.from(await signedRangeRes.arrayBuffer());
      assert.deepEqual(streamedChunk, mp4Buf.subarray(0, 16));
      record('11. Entitled user receives short-lived signed URL and streams protected MP4 (206 Range)');
    },
  );

  // =========================================================================
  // SUITE 12: Firebase JWT Claim & Format Verification Hardening
  // =========================================================================
  {
    const makeUnsignedJwt = (header: object, payload: object) => {
      const h = Buffer.from(JSON.stringify(header)).toString('base64url');
      const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return `${h}.${p}.invalidsig`;
    };
    const now = Math.floor(Date.now() / 1000);
    assert.equal(await verifyFirebaseIdToken(''), null);
    assert.equal(await verifyFirebaseIdToken('not-a-jwt'), null);
    assert.equal(
      await verifyFirebaseIdToken(
        makeUnsignedJwt(
          { alg: 'none', kid: 'kid1' },
          { aud: 'goppo-kahini', iss: 'https://securetoken.google.com/goppo-kahini', sub: 'u1', exp: now + 3600, iat: now },
        ),
      ),
      null,
    );
    assert.equal(
      await verifyFirebaseIdToken(
        makeUnsignedJwt(
          { alg: 'RS256', kid: 'kid1' },
          { aud: 'wrong-project', iss: 'https://securetoken.google.com/goppo-kahini', sub: 'u1', exp: now + 3600, iat: now },
        ),
      ),
      null,
    );
    assert.equal(
      await verifyFirebaseIdToken(
        makeUnsignedJwt(
          { alg: 'RS256', kid: 'kid1' },
          { aud: 'goppo-kahini', iss: 'https://securetoken.google.com/wrong', sub: 'u1', exp: now + 3600, iat: now },
        ),
      ),
      null,
    );
    assert.equal(
      await verifyFirebaseIdToken(
        makeUnsignedJwt(
          { alg: 'RS256', kid: 'kid1' },
          { aud: 'goppo-kahini', iss: 'https://securetoken.google.com/goppo-kahini', sub: 'u1', exp: now - 60, iat: now - 3600 },
        ),
      ),
      null,
    );
    record('12. verifyFirebaseIdToken rejects malformed, alg=none, wrong-aud, wrong-iss, and expired JWTs');
  }

  // =========================================================================
  // SUITE 13: Auth Lifecycle (Google + Email/Password, Session Persistence, Logout)
  // =========================================================================
  await withServer(
    {
      isProductionOverride: true,
      allowSandboxOverride: false,
      paymentGatewayOverride: { enabled: false },
    },
    async (baseUrl) => {
      // Missing / invalid token rejected with 401
      const noTokenRes = await fetch(`${baseUrl}/api/auth/firebase`, { method: 'POST' });
      assert.equal(noTokenRes.status, 401);

      const badTokenRes = await fetch(`${baseUrl}/api/auth/firebase`, {
        method: 'POST',
        headers: { Authorization: 'Bearer invalid.jwt.token' },
      });
      assert.equal(badTokenRes.status, 401);

      // Unverified email claiming owner email MUST NOT elevate to admin
      const spoofUnverified = await fetch(`${baseUrl}/api/auth/firebase`, {
        method: 'POST',
        headers: { Authorization: 'Bearer tok.emailunverified.jwt' },
      });
      assert.equal(spoofUnverified.status, 200);
      const spoofBody = await spoofUnverified.json();
      assert.equal(spoofBody.user.role, 'listener');

      // Verified Email/Password sign-in works cleanly & persists across /api/bootstrap
      const emailSignIn = await fetch(`${baseUrl}/api/auth/firebase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.emailverified.jwt',
        },
        body: JSON.stringify({ language: 'hi' }),
      });
      assert.equal(emailSignIn.status, 200);
      const emailBody = await emailSignIn.json();
      assert.equal(emailBody.user.email, 'charlie@example.com');
      assert.equal(emailBody.user.role, 'listener');
      assert.equal(emailBody.user.preferredLanguage, 'hi');

      const bootWithEmailToken = await fetch(`${baseUrl}/api/bootstrap`, {
        headers: { Authorization: 'Bearer tok.emailverified.jwt' },
      });
      assert.equal(bootWithEmailToken.status, 200);
      const bootData = await bootWithEmailToken.json();
      assert.equal(bootData.user.email, 'charlie@example.com');
      assert.equal(bootData.user.firebaseUid, 'uid_email_ver_003');

      // Non-Firebase listener login & logout invalidation
      const listenerLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'localuser@example.com', name: 'Local User', language: 'bn' }),
      });
      assert.equal(listenerLogin.status, 200);
      const listenerPayload = await listenerLogin.json();
      assert.ok(listenerPayload.token);

      const bootLocalBeforeLogout = await fetch(`${baseUrl}/api/bootstrap`, {
        headers: { Authorization: `Bearer ${listenerPayload.token}` },
      });
      assert.equal((await bootLocalBeforeLogout.json()).user.email, 'localuser@example.com');

      const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${listenerPayload.token}` },
      });
      assert.equal(logoutRes.status, 200);

      const bootLocalAfterLogout = await fetch(`${baseUrl}/api/bootstrap`, {
        headers: { Authorization: `Bearer ${listenerPayload.token}` },
      });
      assert.equal((await bootLocalAfterLogout.json()).user, null);

      record('13. Auth lifecycle (Google/Email providers, unverified role guard, session persistence, logout)');
    },
  );

  // =========================================================================
  // SUITE 14: Fail-Closed Upload Serving, Query Token Rejection, CSP Sandbox
  // =========================================================================
  await withServer(
    {
      isProductionOverride: true,
      allowSandboxOverride: false,
      paymentGatewayOverride: { enabled: false },
    },
    async (baseUrl) => {
      await fetch(`${baseUrl}/api/auth/firebase`, {
        method: 'POST',
        headers: { Authorization: 'Bearer tok.owner.jwt' },
      });
      await fetch(`${baseUrl}/api/auth/firebase`, {
        method: 'POST',
        headers: { Authorization: 'Bearer tok.alice.jwt' },
      });

      // Query-string ?token= MUST NOT authenticate bearer requests
      const queryTokRes = await fetch(`${baseUrl}/api/admin/export?token=tok.owner.jwt`);
      assert.equal(queryTokRes.status, 403);

      // Unattached staff upload (not yet attached to a published free story) MUST fail closed (401/403)
      const upPng = await fetch(`${baseUrl}/api/admin/upload-media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          fileData: makeMinimalPngBuffer().toString('base64'),
          fileName: 'unattached_cover.png',
          mediaType: 'image',
          accessTier: 'free',
        }),
      });
      assert.equal(upPng.status, 200);
      const unattachedData = await upPng.json();

      const unauthUnattached = await fetch(`${baseUrl}${unattachedData.url}`);
      assert.equal(unauthUnattached.status, 401);

      const listenerUnattached = await fetch(`${baseUrl}${unattachedData.url}`, {
        headers: { Authorization: 'Bearer tok.alice.jwt' },
      });
      assert.equal(listenerUnattached.status, 403);

      // Staff preview via signed previewUrl (?mt=) succeeds with CSP sandbox header
      const staffPreview = await fetch(`${baseUrl}${unattachedData.previewUrl}`);
      assert.equal(staffPreview.status, 200);
      assert.equal(
        staffPreview.headers.get('content-security-policy'),
        "default-src 'none'; sandbox",
      );

      // Attach to a DRAFT story: still blocked for unauthenticated/regular users
      await fetch(`${baseUrl}/api/admin/stories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          id: 'bn-draft-media-test',
          language: 'bn',
          category: 'audio',
          title: 'Draft Story Media Guard',
          genre: 'Mystery',
          coverArt: unattachedData.url,
          ticketPriceInr: 0,
          publicationStatus: 'draft',
          episodes: [{ id: 'ep1', title: 'Ep 1', durationLabel: '05:00' }],
        }),
      });
      const guestDraftArt = await fetch(`${baseUrl}${unattachedData.url}`);
      assert.equal(guestDraftArt.status, 401);

      // Once PUBLISHED, coverArt / free story media becomes publicly accessible
      await fetch(`${baseUrl}/api/admin/stories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          id: 'bn-draft-media-test',
          language: 'bn',
          category: 'audio',
          title: 'Draft Story Media Guard',
          genre: 'Mystery',
          coverArt: unattachedData.url,
          ticketPriceInr: 0,
          publicationStatus: 'published',
          episodes: [{ id: 'ep1', title: 'Ep 1', durationLabel: '05:00' }],
        }),
      });
      const guestPubArt = await fetch(`${baseUrl}${unattachedData.url}`);
      assert.equal(guestPubArt.status, 200);
      record('14. Fail-closed /api/uploads/:fileName, ?token= rejection, and CSP sandbox header');
    },
  );

  // =========================================================================
  // SUITE 15: Data Protection (Delete RBAC, Import Guards, Backup Snapshots, Rules)
  // =========================================================================
  await withServer(
    {
      isProductionOverride: true,
      allowSandboxOverride: false,
      paymentGatewayOverride: { enabled: false },
    },
    async (baseUrl, dataDir) => {
      await fetch(`${baseUrl}/api/auth/firebase`, {
        method: 'POST',
        headers: { Authorization: 'Bearer tok.owner.jwt' },
      });
      await fetch(`${baseUrl}/api/admin/editors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          email: 'storyeditor@goppokahini.in',
          name: 'Story Only Editor',
          uid: 'uid_editor_story',
          permissions: ['manage_stories'],
        }),
      });

      // Create one draft and one published story
      await fetch(`${baseUrl}/api/admin/stories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.editorstory.jwt',
        },
        body: JSON.stringify({
          id: 'bn-ed-draft',
          language: 'bn',
          category: 'audio',
          title: 'Editor Draft',
          genre: 'Drama',
          publicationStatus: 'draft',
          episodes: [{ id: 'd1', title: 'Ep 1', durationLabel: '05:00' }],
        }),
      });
      await fetch(`${baseUrl}/api/admin/stories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({
          id: 'bn-pub-protected',
          language: 'bn',
          category: 'audio',
          title: 'Protected Live Story',
          genre: 'Mystery',
          publicationStatus: 'published',
          episodes: [{ id: 'p1', title: 'Ep 1', durationLabel: '10:00' }],
        }),
      });

      // Editor CANNOT permanently delete a published story (403)
      const edDelPub = await fetch(`${baseUrl}/api/admin/stories/bn-pub-protected`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer tok.editorstory.jwt' },
      });
      assert.equal(edDelPub.status, 403);

      // Editor CAN delete their draft story (200)
      const edDelDraft = await fetch(`${baseUrl}/api/admin/stories/bn-ed-draft`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer tok.editorstory.jwt' },
      });
      assert.equal(edDelDraft.status, 200);

      // Owner CAN delete published story & backup snapshot is persisted
      const ownerDelPub = await fetch(`${baseUrl}/api/admin/stories/bn-pub-protected`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer tok.owner.jwt' },
      });
      assert.equal(ownerDelPub.status, 200);
      const backupsDir = path.join(dataDir, 'backups');
      assert.ok(fs.existsSync(backupsDir) && fs.readdirSync(backupsDir).length >= 1);

      // /api/admin/import rejects empty array & malformed entries
      const emptyImport = await fetch(`${baseUrl}/api/admin/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({ stories: [] }),
      });
      assert.equal(emptyImport.status, 400);

      const badImport = await fetch(`${baseUrl}/api/admin/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok.owner.jwt',
        },
        body: JSON.stringify({ stories: [{ id: '../evil', title: '' }] }),
      });
      assert.equal(badImport.status, 400);

      // Static verification of hardened firestore.rules constraints
      const rulesText = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');
      assert.ok(rulesText.includes("docId == 'info'"));
      assert.ok(rulesText.includes('data.email == request.auth.token.email'));
      assert.ok(rulesText.includes("hasEditorPermission('manage_hero')"));
      assert.ok(rulesText.includes("existing().publicationStatus == 'draft'"));
      record('15. Data protection (Editor delete guard, import validation, pre-mutation backups, rules)');
    },
  );

  // =========================================================================
  // SUITE 16: Web Push (VAPID, FCM Token Persistence, Firebase Admin Dispatch)
  // =========================================================================
  {
    const capturedMulticasts: Array<{ tokens: string[]; title?: string; body?: string; link?: string }> = [];
    let forceInvalidToken = false;

    await withServer(
      {
        isProductionOverride: true,
        allowSandboxOverride: false,
        paymentGatewayOverride: { enabled: false },
        messagingOverride: {
          async sendEachForMulticast(msg) {
            capturedMulticasts.push({
              tokens: [...msg.tokens],
              title: msg.notification?.title,
              body: msg.notification?.body,
              link: msg.webpush?.fcmOptions?.link,
            });
            if (forceInvalidToken) {
              return {
                successCount: 0,
                failureCount: msg.tokens.length,
                responses: msg.tokens.map(() => ({
                  success: false,
                  error: {
                    code: 'messaging/registration-token-not-registered',
                    message: 'Requested entity was not found.',
                    toJSON: () => ({}),
                  },
                })),
              };
            }
            return {
              successCount: msg.tokens.length,
              failureCount: 0,
              responses: msg.tokens.map((_, idx) => ({
                success: true,
                messageId: `projects/goppo-kahini/messages/test_msg_${idx}`,
              })),
            };
          },
        },
      },
      async (baseUrl) => {
        // Unauthenticated cannot register or send notifications
        const unauthReg = await fetch(`${baseUrl}/api/notifications/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: 'fcm_unauth_token_1234567890' }),
        });
        assert.equal(unauthReg.status, 401);

        // Authenticate Test Account (Alice) and register FCM token
        const aliceAuth = await fetch(`${baseUrl}/api/auth/firebase`, {
          method: 'POST',
          headers: { Authorization: 'Bearer tok.alice.jwt' },
        });
        assert.equal(aliceAuth.status, 200);

        const testDeviceToken = 'cX7_test_fcm_token:APA91bGoppoKahiniTestAccountToken1234567890';
        const aliceReg = await fetch(`${baseUrl}/api/notifications/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer tok.alice.jwt',
          },
          body: JSON.stringify({ token: testDeviceToken, platform: 'web', language: 'bn' }),
        });
        assert.equal(aliceReg.status, 200);
        const aliceRegData = (await aliceReg.json()) as { ok: boolean; uid: string; tokenId: string };
        assert.equal(aliceRegData.ok, true);
        assert.equal(aliceRegData.uid, 'uid_alice_001');
        assert.match(aliceRegData.tokenId, /^fcm_[a-zA-Z0-9_-]{1,120}$/);

        // Regular listener CANNOT read token summaries or send notifications
        const aliceList = await fetch(`${baseUrl}/api/admin/notifications/tokens`, {
          headers: { Authorization: 'Bearer tok.alice.jwt' },
        });
        assert.equal(aliceList.status, 403);

        const aliceSend = await fetch(`${baseUrl}/api/admin/notifications/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer tok.alice.jwt',
          },
          body: JSON.stringify({ title: 'Hack', body: 'Spam' }),
        });
        assert.equal(aliceSend.status, 403);

        // Owner/Admin inspects masked token summaries & sends push to Test Account by email
        const adminList = await fetch(`${baseUrl}/api/admin/notifications/tokens`, {
          headers: { Authorization: 'Bearer tok.owner.jwt' },
        });
        assert.equal(adminList.status, 200);
        const listData = (await adminList.json()) as {
          totalTokens: number;
          tokens: Array<{ uid: string; tokenPreview: string }>;
        };
        assert.equal(listData.totalTokens, 1);
        assert.equal(listData.tokens[0].uid, 'uid_alice_001');
        assert.ok(!listData.tokens[0].tokenPreview.includes('APA91bGoppoKahiniTestAccount'));

        const sendRes = await fetch(`${baseUrl}/api/admin/notifications/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer tok.owner.jwt',
          },
          body: JSON.stringify({
            targetEmail: 'alice@example.com',
            title: 'টেস্ট গল্প আপডেট',
            body: 'নতুন অডিও পর্ব প্রকাশিত হয়েছে।',
            link: '/stories',
          }),
        });
        assert.equal(sendRes.status, 200);
        const sendData = (await sendRes.json()) as {
          targetCount: number;
          sentCount: number;
          failureCount: number;
        };
        assert.equal(sendData.targetCount, 1);
        assert.equal(sendData.sentCount, 1);
        assert.equal(sendData.failureCount, 0);
        assert.equal(capturedMulticasts.length, 1);
        assert.deepEqual(capturedMulticasts[0].tokens, [testDeviceToken]);
        assert.equal(capturedMulticasts[0].link, '/stories');

        // Permanently unregistered FCM tokens are pruned automatically
        forceInvalidToken = true;
        const staleSendRes = await fetch(`${baseUrl}/api/admin/notifications/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer tok.owner.jwt',
          },
          body: JSON.stringify({
            targetUid: 'uid_alice_001',
            title: 'Cleanup Check',
            body: 'Testing unregistered token removal',
          }),
        });
        assert.equal(staleSendRes.status, 200);
        const staleData = (await staleSendRes.json()) as {
          failureCount: number;
          removedInvalidTokens: number;
        };
        assert.equal(staleData.failureCount, 1);
        assert.equal(staleData.removedInvalidTokens, 1);

        const afterCleanupList = await fetch(`${baseUrl}/api/admin/notifications/tokens`, {
          headers: { Authorization: 'Bearer tok.owner.jwt' },
        });
        const afterData = (await afterCleanupList.json()) as { totalTokens: number };
        assert.equal(afterData.totalTokens, 0);

        // Verify .env, .env.example, firebase-messaging-sw.js, and firestore.rules
        const envExample = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf8');
        assert.ok(envExample.includes('VITE_FIREBASE_VAPID_KEY='));
        const envLocal = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
        assert.ok(envLocal.includes('VITE_FIREBASE_VAPID_KEY='));
        const swCode = fs.readFileSync(
          path.join(process.cwd(), 'public', 'firebase-messaging-sw.js'),
          'utf8',
        );
        assert.ok(swCode.includes("addEventListener('push'") && swCode.includes("addEventListener('notificationclick'"));
        const rulesText = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');
        assert.ok(rulesText.includes('match /fcmTokens/{tokenId}'));

        record('16. Web Push FCM (VAPID env, token registration, Admin send to test account, stale pruning)');
      },
    );
  }

  // =========================================================================
  // SUITE 17: Environment Auth Separation (CI/Local Mock Guard vs Cloud Run)
  // =========================================================================
  {
    const prevKService = process.env.K_SERVICE;
    const prevNodeEnv = process.env.NODE_ENV;
    const prevNoAutostart = process.env.GOPPO_NO_AUTOSTART;
    process.env.K_SERVICE = 'goppo-kahini-prod';
    process.env.NODE_ENV = 'production';
    delete process.env.GOPPO_NO_AUTOSTART;
    try {
      const prodTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goppo-prod-guard-'));
      try {
        assert.throws(
          () =>
            createGoppoApp({
              dataDir: prodTempDir,
              skipCloudHydration: true,
              verifyTokenImpl: async () => MOCK_TOKENS['tok.owner.jwt'],
            }),
          /SECURITY_VIOLATION/,
        );
        assert.throws(
          () =>
            createGoppoApp({
              dataDir: prodTempDir,
              skipCloudHydration: true,
              disableLiveFirebaseAdmin: true,
            }),
          /SECURITY_VIOLATION/,
        );
        assert.throws(
          () =>
            createGoppoApp({
              dataDir: prodTempDir,
              skipCloudHydration: true,
              messagingOverride: {
                async sendEachForMulticast() {
                  return { successCount: 0, failureCount: 0, responses: [] };
                },
              },
            }),
          /SECURITY_VIOLATION/,
        );
      } finally {
        fs.rmSync(prodTempDir, { recursive: true, force: true });
      }
    } finally {
      if (prevKService === undefined) delete process.env.K_SERVICE;
      else process.env.K_SERVICE = prevKService;
      if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNodeEnv;
      if (prevNoAutostart === undefined) delete process.env.GOPPO_NO_AUTOSTART;
      else process.env.GOPPO_NO_AUTOSTART = prevNoAutostart;
    }

    // Verify production-configured server WITHOUT verifyTokenImpl rejects mock bearer tokens
    const realAuthTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goppo-prod-nomock-'));
    const { app: realAuthApp } = createGoppoApp({
      dataDir: realAuthTempDir,
      isProductionOverride: true,
      allowSandboxOverride: false,
      skipCloudHydration: true,
    });
    const realAuthServer = http.createServer(realAuthApp);
    await new Promise<void>((resolve) => realAuthServer.listen(0, '127.0.0.1', resolve));
    const { port } = realAuthServer.address() as AddressInfo;
    try {
      const mockJwtAttempt = await fetch(`http://127.0.0.1:${port}/api/auth/firebase`, {
        method: 'POST',
        headers: { Authorization: 'Bearer tok.owner.jwt' },
      });
      assert.equal(mockJwtAttempt.status, 401);

      const mockAdminAttempt = await fetch(`http://127.0.0.1:${port}/api/admin/export`, {
        headers: { Authorization: 'Bearer tok.owner.jwt' },
      });
      assert.equal(mockAdminAttempt.status, 403);
    } finally {
      await new Promise<void>((resolve, reject) =>
        realAuthServer.close((err) => (err ? reject(err) : resolve())),
      );
      fs.rmSync(realAuthTempDir, { recursive: true, force: true });
    }

    record('17. Environment isolation (Cloud Run forbids mocks; prod rejects forged tokens; CI runs ADC-free)');
  }

  for (const line of results) {
    console.log(line);
  }
  console.log(`\nALL ${results.length} SECURITY VERIFICATION SUITES PASSED.`);
}

runTests().catch((err) => {
  console.error('SECURITY VERIFICATION FAILED:', err);
  process.exit(1);
});
