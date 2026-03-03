import { memo, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useForm } from 'react-hook-form';
import { Spinner } from '@librechat/client';
import { useParams } from 'react-router-dom';
import {
  Constants,
  EModelEndpoint,
  Permissions,
  PermissionTypes,
  buildTree,
} from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ChatFormValues } from '~/common';
import { ChatContext, AddedChatContext, useFileMapContext, ChatFormProvider } from '~/Providers';
import {
  useAddedResponse,
  useResumeOnLoad,
  useAdaptiveSSE,
  useChatHelpers,
  useOAuthCompleteListener,
  useAuthContext,
} from '~/hooks';
import { useGetAgentsConfig } from '~/hooks/Agents';
import { useHasAccess } from '~/hooks';
import {
  useGetStartupConfig,
  useGetEndpointsQuery,
  useMCPServersQuery,
} from '~/data-provider';
import ConversationStarters from './Input/ConversationStarters';
import {
  EmailEllisWidget,
  CRMWidget,
  IntegrationsWidget,
  ScheduledAgentsWidget,
} from './Dashboard';
import { useGetMessagesByConvoId } from '~/data-provider';
import MessagesView from './Messages/MessagesView';
import Presentation from './Presentation';
import ChatForm from './Input/ChatForm';
import Header from './Header';
import Footer from './Footer';
import { cn } from '~/utils';
import store from '~/store';

function LoadingSpinner() {
  return (
    <div className="relative flex-1 overflow-hidden overflow-y-auto">
      <div className="relative flex h-full items-center justify-center">
        <Spinner className="text-text-primary" />
      </div>
    </div>
  );
}

function ChatView({ index = 0 }: { index?: number }) {
  const { conversationId } = useParams();
  const { user } = useAuthContext();
  const { agentsConfig } = useGetAgentsConfig();
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: mcpServers } = useMCPServersQuery();
  const hasAccessToAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });
  const showIntegrationsGrid =
    !!mcpServers && Object.keys(mcpServers).length > 0;
  const interfaceConfig = startupConfig?.interface ?? {};
  const showScheduledAgentsWidget =
    interfaceConfig.scheduledAgents !== false &&
    !!endpointsConfig?.[EModelEndpoint.agents] &&
    hasAccessToAgents;
  const rootSubmission = useRecoilValue(store.submissionByIndex(index));
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);

  const fileMap = useFileMapContext();
  const chatHelpers = useChatHelpers(index, conversationId);

  const { data: messagesTree = null, isLoading } = useGetMessagesByConvoId(conversationId ?? '', {
    select: useCallback(
      (data: TMessage[]) => {
        const dataTree = buildTree({ messages: data, fileMap });
        return dataTree?.length === 0 ? null : (dataTree ?? null);
      },
      [fileMap],
    ),
    enabled: !!fileMap,
  });

  const addedChatHelpers = useAddedResponse();

  useAdaptiveSSE(rootSubmission, chatHelpers, false, index);

  // Auto-resume if navigating back to conversation with active job
  // Wait for messages to load before resuming to avoid race condition
  useResumeOnLoad(conversationId, chatHelpers.getMessages, index, !isLoading);

  // When OAuth popup completes, invalidate messages to pick up continuation
  useOAuthCompleteListener(conversationId ?? undefined);

  const methods = useForm<ChatFormValues>({
    defaultValues: { text: '' },
  });

  let content: JSX.Element | null | undefined;
  const isLandingPage =
    (!messagesTree || messagesTree.length === 0) &&
    (conversationId === Constants.NEW_CONVO || !conversationId);
  const isNavigating = (!messagesTree || messagesTree.length === 0) && conversationId != null;

  if (isLoading && conversationId !== Constants.NEW_CONVO) {
    content = <LoadingSpinner />;
  } else if ((isLoading || isNavigating) && !isLandingPage) {
    content = <LoadingSpinner />;
  } else if (!isLandingPage) {
    content = <MessagesView messagesTree={messagesTree} />;
  } else {
    content = centerFormOnLanding ? null : <div className="min-h-0 flex-1" />;
  }

  return (
    <ChatFormProvider {...methods}>
      <ChatContext.Provider value={chatHelpers}>
        <AddedChatContext.Provider value={addedChatHelpers}>
          <Presentation>
            <div className="relative flex min-h-0 h-full w-full flex-col">
              {!isLoading && <Header />}
              <>
                <div
                  className={cn(
                    'flex min-h-0 flex-col overflow-y-auto',
                    isLandingPage ? 'flex-1 items-center' : 'h-full',
                    isLandingPage &&
                      !(
                        agentsConfig?.inboundEmailAddress ||
                        user?.projectId ||
                        showIntegrationsGrid ||
                        showScheduledAgentsWidget
                      ) && 'justify-end sm:justify-center',
                    isLandingPage &&
                      (agentsConfig?.inboundEmailAddress ||
                        user?.projectId ||
                        showIntegrationsGrid ||
                        showScheduledAgentsWidget) &&
                      'justify-start',
                  )}
                >
                  {isLandingPage &&
                    (agentsConfig?.inboundEmailAddress ||
                      user?.projectId ||
                      showIntegrationsGrid ||
                      showScheduledAgentsWidget) && (
                      <div className="mb-6 grid w-full max-w-3xl grid-cols-1 gap-4 px-4 pt-16 sm:grid-cols-2 xl:max-w-4xl [&>*:only-child]:sm:col-span-2">
                        <EmailEllisWidget />
                        <CRMWidget />
                        <IntegrationsWidget />
                        <ScheduledAgentsWidget />
                      </div>
                    )}
                  {content}
                  <div
                    className={cn(
                      'w-full',
                      isLandingPage && 'max-w-3xl transition-all duration-200 xl:max-w-4xl',
                    )}
                  >
                    <ChatForm index={index} />
                    {isLandingPage ? <ConversationStarters /> : <Footer />}
                  </div>
                </div>
                {isLandingPage && <Footer />}
              </>
            </div>
          </Presentation>
        </AddedChatContext.Provider>
      </ChatContext.Provider>
    </ChatFormProvider>
  );
}

export default memo(ChatView);
