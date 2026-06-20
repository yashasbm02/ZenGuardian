// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnalysisCard } from './AnalysisCard';

describe('AnalysisCard Component', () => {
  const mockMetrics = {
    primaryEmotion: 'Anxious',
    stressScore: 7,
    detectedTriggers: ['exams', 'time'],
    copingStrategy: 'Take a deep breath and break tasks down.',
  };

  it('renders the primary emotion and stress score', () => {
    render(<AnalysisCard metrics={mockMetrics} />);
    
    expect(screen.getByText('Anxious')).toBeDefined();
    expect(screen.getByText('7/10')).toBeDefined();
    expect(screen.getByText('High stress')).toBeDefined();
  });

  it('renders triggers if provided', () => {
    render(<AnalysisCard metrics={mockMetrics} />);
    
    expect(screen.getByText('exams')).toBeDefined();
    expect(screen.getByText('time')).toBeDefined();
  });

  it('renders coping strategy', () => {
    render(<AnalysisCard metrics={mockMetrics} />);
    
    expect(screen.getByText('Take a deep breath and break tasks down.')).toBeDefined();
  });
});
