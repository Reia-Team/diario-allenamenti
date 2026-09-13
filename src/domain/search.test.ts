import { describe, expect, it } from 'vitest';
import { normalizeText, searchExercises } from './search';

const items = [
  { name: 'Panca piana', muscleGroup: 'Pettorali' },
  { name: 'Panca inclinata', muscleGroup: 'Pettorali' },
  { name: 'Chest Press (Macchina)', muscleGroup: 'Pettorali' },
  { name: 'Leg Press', muscleGroup: 'Gambe/Glutei' },
  { name: 'Croci su panca piana', muscleGroup: 'Pettorali' },
];

describe('ricerca esercizi', () => {
  it('"panca" trova tutte le panche, prima quelle che iniziano con la parola', () => {
    expect(searchExercises(items, 'panca').map((i) => i.name)).toEqual(['Panca inclinata', 'Panca piana', 'Croci su panca piana']);
  });
  it('case e accenti non contano; più parole', () => {
    expect(normalizeText('Più Àlto')).toBe('piu alto');
    expect(searchExercises(items, 'PRESS gambe').map((i) => i.name)).toEqual(['Leg Press']);
  });
  it('cerca anche per gruppo muscolare', () => {
    expect(searchExercises(items, 'pettorali')).toHaveLength(4);
  });
  it('query vuota → tutti in ordine alfabetico', () => {
    expect(searchExercises(items, '  ')[0].name).toBe('Chest Press (Macchina)');
  });
});
