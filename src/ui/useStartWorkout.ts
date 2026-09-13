import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { ActiveSessionError, startSession } from '../data/repo/sessions';
import { unlockAudio } from '../services/feedback';
import { errorMessage, useToast } from './toast';
import type { ID, ISODate } from '../domain/types';

export function useStartWorkout() {
  const navigate = useNavigate();
  const { show } = useToast();
  return useCallback(
    async (programId: ID, templateId: ID, date?: ISODate) => {
      unlockAudio();
      try {
        const session = await startSession({ programId, templateId, date });
        navigate(`/workout/${session.id}`);
      } catch (err) {
        if (err instanceof ActiveSessionError) {
          show(err.message, 'info');
          navigate(`/workout/${err.sessionId}`);
          return;
        }
        show(errorMessage(err), 'error');
      }
    },
    [navigate, show],
  );
}
