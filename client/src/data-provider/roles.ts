import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  QueryKeys,
  dataService,
  promptPermissionsSchema,
  memoryPermissionsSchema,
  mcpServersPermissionsSchema,
  marketplacePermissionsSchema,
  peoplePickerPermissionsSchema,
  remoteAgentsPermissionsSchema,
  multiConvoPermissionsSchema,
  presetsPermissionsSchema,
  endpointsMenuPermissionsSchema,
} from 'librechat-data-provider';
import type {
  QueryObserverResult,
  UseMutationResult,
  UseQueryOptions,
} from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

export const useGetRole = (
  roleName: string,
  config?: UseQueryOptions<t.TRole>,
): QueryObserverResult<t.TRole> => {
  return useQuery<t.TRole>([QueryKeys.roles, roleName], () => dataService.getRole(roleName), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
  });
};

export const useUpdatePromptPermissionsMutation = (
  options?: t.UpdatePromptPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdatePromptPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      promptPermissionsSchema.partial().parse(variables.updates);
      return dataService.updatePromptPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update prompt permissions:', error);
        }
        if (onError) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};

export const useUpdateAgentPermissionsMutation = (
  options?: t.UpdateAgentPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdateAgentPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      promptPermissionsSchema.partial().parse(variables.updates);
      return dataService.updateAgentPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess != null) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update prompt permissions:', error);
        }
        if (onError != null) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};

export const useUpdateMemoryPermissionsMutation = (
  options?: t.UpdateMemoryPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdateMemoryPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      memoryPermissionsSchema.partial().parse(variables.updates);
      return dataService.updateMemoryPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update memory permissions:', error);
        }
        if (onError) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};

export const useUpdatePeoplePickerPermissionsMutation = (
  options?: t.UpdatePeoplePickerPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdatePeoplePickerPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      peoplePickerPermissionsSchema.partial().parse(variables.updates);
      return dataService.updatePeoplePickerPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update people picker permissions:', error);
        }
        if (onError) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};

export const useUpdateMCPServersPermissionsMutation = (
  options?: t.UpdateMCPServersPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdateMCPServersPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      mcpServersPermissionsSchema.partial().parse(variables.updates);
      return dataService.updateMCPServersPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update MCP servers permissions:', error);
        }
        if (onError) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};

export const useUpdateMarketplacePermissionsMutation = (
  options?: t.UpdateMarketplacePermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdateMarketplacePermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      marketplacePermissionsSchema.partial().parse(variables.updates);
      return dataService.updateMarketplacePermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update marketplace permissions:', error);
        }
        if (onError) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};

export const useUpdateRemoteAgentsPermissionsMutation = (
  options?: t.UpdateRemoteAgentsPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdateRemoteAgentsPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      remoteAgentsPermissionsSchema.partial().parse(variables.updates);
      return dataService.updateRemoteAgentsPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update remote agents permissions:', error);
        }
        if (onError) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};

export const useUpdateMultiConvoPermissionsMutation = (
  options?: t.UpdateMultiConvoPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdateMultiConvoPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      multiConvoPermissionsSchema.partial().parse(variables.updates);
      return dataService.updateMultiConvoPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update multi-convo permissions:', error);
        }
        if (onError) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};

export const useUpdatePresetsPermissionsMutation = (
  options?: t.UpdatePresetsPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdatePresetsPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      presetsPermissionsSchema.partial().parse(variables.updates);
      return dataService.updatePresetsPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update presets permissions:', error);
        }
        if (onError) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};

export const useUpdateEndpointsMenuPermissionsMutation = (
  options?: t.UpdateEndpointsMenuPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdateEndpointsMenuPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      endpointsMenuPermissionsSchema.partial().parse(variables.updates);
      return dataService.updateEndpointsMenuPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update endpoints menu permissions:', error);
        }
        if (onError) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};
