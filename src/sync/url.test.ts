import { describe, expect, it } from 'vitest';
import { normalizeUrl } from './index';

describe('normalizeUrl', () => {
  it('REST エンドポイントを貼られてもドメインだけにする', () => {
    expect(normalizeUrl('https://abcd.supabase.co/rest/v1/')).toBe('https://abcd.supabase.co');
    expect(normalizeUrl('https://abcd.supabase.co/auth/v1')).toBe('https://abcd.supabase.co');
    expect(normalizeUrl(' https://abcd.supabase.co ')).toBe('https://abcd.supabase.co');
  });
  it('スキーム無しは https を補う。空や壊れた値は空文字', () => {
    expect(normalizeUrl('abcd.supabase.co')).toBe('https://abcd.supabase.co');
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('not a url')).toBe('');
  });
});
