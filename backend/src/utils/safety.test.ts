import { describe, it, expect } from 'vitest';
import { detectsCrisis, CRISIS_RESOURCE_MESSAGE } from './safety';

describe('Safety Crisis Detection', () => {
  it('detects explicit crisis language', () => {
    expect(detectsCrisis('I want to end my life')).toBe(true);
    expect(detectsCrisis('I might hurt myself')).toBe(true);
    expect(detectsCrisis('suicidal thoughts')).toBe(true);
  });

  it('detects high stress scores as crisis', () => {
    expect(detectsCrisis('I am fine', 9)).toBe(true);
    expect(detectsCrisis('I am fine', 10)).toBe(true);
  });

  it('returns false for normal text and low stress', () => {
    expect(detectsCrisis('I am feeling a bit stressed today', 5)).toBe(false);
    expect(detectsCrisis('Having a great day!', 2)).toBe(false);
  });

  it('exports a valid crisis message', () => {
    expect(CRISIS_RESOURCE_MESSAGE).toContain('Tele-MANAS at 14416');
  });
});
