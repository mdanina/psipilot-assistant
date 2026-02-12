import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Static analysis tests for security configuration files.
 * These tests verify that security headers and middleware are properly configured.
 */
describe('Security configuration', () => {
  describe('nginx.conf', () => {
    const nginxConf = readFileSync(
      resolve(__dirname, '../../../deploy/nginx.conf'),
      'utf-8'
    );

    it('should include Content-Security-Policy header', () => {
      expect(nginxConf).toContain('Content-Security-Policy');
      expect(nginxConf).toContain("default-src 'self'");
      expect(nginxConf).toContain("script-src 'self'");
      expect(nginxConf).toContain("style-src 'self' 'unsafe-inline'");
    });

    it('should allow Supabase connections in CSP', () => {
      expect(nginxConf).toContain('https://*.supabase.co');
      expect(nginxConf).toContain('wss://*.supabase.co');
    });

    it('should allow blob: for media and workers (audio recording)', () => {
      expect(nginxConf).toMatch(/media-src.*blob:/);
      expect(nginxConf).toMatch(/worker-src.*blob:/);
    });

    it('should include Strict-Transport-Security (HSTS)', () => {
      expect(nginxConf).toContain('Strict-Transport-Security');
      expect(nginxConf).toContain('max-age=31536000');
      expect(nginxConf).toContain('includeSubDomains');
    });

    it('should include Referrer-Policy', () => {
      expect(nginxConf).toContain('Referrer-Policy');
      expect(nginxConf).toContain('strict-origin-when-cross-origin');
    });

    it('should include X-Frame-Options', () => {
      expect(nginxConf).toContain('X-Frame-Options');
      expect(nginxConf).toContain('SAMEORIGIN');
    });

    it('should include X-Content-Type-Options', () => {
      expect(nginxConf).toContain('X-Content-Type-Options');
      expect(nginxConf).toContain('nosniff');
    });

    it('should NOT include deprecated X-XSS-Protection', () => {
      expect(nginxConf).not.toContain('X-XSS-Protection');
    });

    it('should include security headers in static assets location block', () => {
      // nginx overrides inherited add_header when a location block has its own add_header
      // So the static assets block must repeat critical security headers
      // Extract the block between "Cache static assets" and the next location/section
      const staticBlockMatch = nginxConf.match(
        /# Cache static assets[\s\S]*?location ~\*[^{]*\{([\s\S]*?)\}/
      );
      expect(staticBlockMatch).not.toBeNull();
      const staticBlockContent = staticBlockMatch![0];
      expect(staticBlockContent).toContain('X-Content-Type-Options');
      expect(staticBlockContent).toContain('nosniff');
    });
  });

  describe('Express backend (server.js)', () => {
    const serverJs = readFileSync(
      resolve(__dirname, '../../../backend/transcription-service/server.js'),
      'utf-8'
    );

    it('should import helmet', () => {
      expect(serverJs).toMatch(/import helmet from ['"]helmet['"]/);
    });

    it('should use helmet middleware', () => {
      expect(serverJs).toContain('app.use(helmet(');
    });

    it('should disable helmet CSP (nginx handles it)', () => {
      expect(serverJs).toContain('contentSecurityPolicy: false');
    });

    it('should place helmet before CORS middleware', () => {
      const helmetIndex = serverJs.indexOf('app.use(helmet(');
      const corsIndex = serverJs.indexOf('app.use(cors(');
      expect(helmetIndex).toBeGreaterThan(-1);
      expect(corsIndex).toBeGreaterThan(-1);
      expect(helmetIndex).toBeLessThan(corsIndex);
    });

    it('should have CORS configured', () => {
      expect(serverJs).toContain('corsOptions');
      expect(serverJs).toContain('allowedOrigins');
    });

    it('should have rate limiting', () => {
      expect(serverJs).toContain('rateLimit');
      expect(serverJs).toContain('generalLimiter');
    });
  });

  describe('Backend package.json', () => {
    const packageJson = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../backend/transcription-service/package.json'),
        'utf-8'
      )
    );

    it('should have helmet as a dependency', () => {
      expect(packageJson.dependencies).toHaveProperty('helmet');
    });

    it('should have express as a dependency', () => {
      expect(packageJson.dependencies).toHaveProperty('express');
    });

    it('should have express-rate-limit as a dependency', () => {
      expect(packageJson.dependencies).toHaveProperty('express-rate-limit');
    });

    it('should have cors as a dependency', () => {
      expect(packageJson.dependencies).toHaveProperty('cors');
    });
  });
});
