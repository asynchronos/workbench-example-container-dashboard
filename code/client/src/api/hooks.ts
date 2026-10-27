import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api, controlSession } from './client';

export function useContainers() {
  return useQuery({ queryKey: ['containers'], queryFn: api.listContainers });
}

export function useContainer(id: string | null) {
  return useQuery({
    queryKey: ['container', id],
    queryFn: () => api.getContainer(id!),
    enabled: id !== null,
    refetchInterval: false,
  });
}

export function useSummary() {
  return useQuery({ queryKey: ['summary'], queryFn: api.getSummary });
}

export function useContainerActions() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['containers'] });
    queryClient.invalidateQueries({ queryKey: ['summary'] });
  };

  const start = useMutation({ mutationFn: api.startContainer, onSettled: invalidate });
  const stop = useMutation({ mutationFn: api.stopContainer, onSettled: invalidate });
  const restart = useMutation({ mutationFn: api.restartContainer, onSettled: invalidate });
  const remove = useMutation({
    mutationFn: ({ id, force }: { id: string; force: boolean }) => api.removeContainer(id, force),
    onSettled: invalidate,
  });

  return { start, stop, restart, remove };
}

export function useControlAccess() {
  const unlocked = useSyncExternalStore(controlSession.subscribe, controlSession.isUnlocked);
  const query = useQuery({
    queryKey: ['control-access'], queryFn: api.getControlAccess, refetchInterval: 30_000,
  });
  return { ...query, unlocked, enabled: query.data?.configured === true && unlocked };
}
