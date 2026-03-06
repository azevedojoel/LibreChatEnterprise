import {
  Tools,
  Constants,
  ContentTypes,
  ToolCallTypes,
  imageGenTools,
  isImageVisionTool,
} from 'librechat-data-provider';
import { memo } from 'react';
import type { TMessageContentParts, TAttachment } from 'librechat-data-provider';
import { OpenAIImageGen, EmptyText, Reasoning, ExecuteCode, AgentUpdate, Text } from './Parts';
import { ErrorMessage } from './MessageContent';
import RetrievalCall from './RetrievalCall';
import AgentHandoff from './AgentHandoff';
import AgentReturn from './AgentReturn';
import ProjectSwitch from './ProjectSwitch';
import CodeAnalyze from './CodeAnalyze';
import Container from './Container';
import WebSearch from './WebSearch';
import DriveSearch from './DriveSearch';
import AgentFileSearch from './AgentFileSearch';
import GmailSearch from './GmailSearch';
import GmailGet from './GmailGet';
import GmailSend from './GmailSend';
import GmailSendDraft from './GmailSendDraft';
import SendUserEmail from './SendUserEmail';
import DocsCreate from './DocsCreate';
import DriveCreateFolder from './DriveCreateFolder';
import DriveDownloadFile from './DriveDownloadFile';
import CreatePdf from './CreatePdf';
import GoogleTasksList from './GoogleTasksList';
import GoogleTaskLists from './GoogleTaskLists';
import GoogleTaskCreate from './GoogleTaskCreate';
import GoogleTaskListCreate from './GoogleTaskListCreate';
import GoogleTaskUpdate from './GoogleTaskUpdate';
import GoogleTaskListUpdate from './GoogleTaskListUpdate';
import GoogleTaskDelete from './GoogleTaskDelete';
import GoogleTaskListDelete from './GoogleTaskListDelete';
import MicrosoftTodoTasks from './MicrosoftTodoTasks';
import MicrosoftTodoTaskLists from './MicrosoftTodoTaskLists';
import MicrosoftTodoTaskCreate from './MicrosoftTodoTaskCreate';
import MicrosoftTodoTaskUpdate from './MicrosoftTodoTaskUpdate';
import MicrosoftTodoTaskDelete from './MicrosoftTodoTaskDelete';
import CalendarList from './CalendarList';
import CalendarListEvents from './CalendarListEvents';
import CalendarCreateEvent from './CalendarCreateEvent';
import CalendarGetEvent from './CalendarGetEvent';
import CalendarUpdateEvent from './CalendarUpdateEvent';
import CalendarDeleteEvent from './CalendarDeleteEvent';
import CalendarRespondToEvent from './CalendarRespondToEvent';
import CalendarFindFreeTime from './CalendarFindFreeTime';
import MSCalendarListEvents from './MSCalendarListEvents';
import MSCalendarGetEvent from './MSCalendarGetEvent';
import MSCalendarCreateEvent from './MSCalendarCreateEvent';
import MSCalendarDeleteEvent from './MSCalendarDeleteEvent';
import MSCalendarUpdateEvent from './MSCalendarUpdateEvent';
import CRMList from './CRMList';
import CRMCard from './CRMCard';
import CRMLogActivity from './CRMLogActivity';
import CRMDelete from './CRMDelete';
import ToolCall from './ToolCall';
import ImageGen from './ImageGen';
import Image from './Image';

function isToolMatch(name: string | undefined, base: string): boolean {
  return name === base || (typeof name === 'string' && name.startsWith(`${base}_mcp_`));
}

type PartProps = {
  part?: TMessageContentParts;
  isLast?: boolean;
  isSubmitting: boolean;
  showCursor: boolean;
  isCreatedByUser: boolean;
  attachments?: TAttachment[];
  /** When false, do not show the inline auth button (first tool per server shows it) */
  showAuthButton?: boolean;
};

const Part = memo(
  ({
    part,
    isSubmitting,
    attachments,
    isLast,
    showCursor,
    isCreatedByUser,
    showAuthButton = true,
  }: PartProps) => {
    if (!part) {
      return null;
    }

    if (part.type === ContentTypes.ERROR) {
      return (
        <ErrorMessage
          text={
            part[ContentTypes.ERROR] ??
            (typeof part[ContentTypes.TEXT] === 'string'
              ? part[ContentTypes.TEXT]
              : part.text?.value) ??
            ''
          }
          className="my-2"
        />
      );
    } else if (part.type === ContentTypes.AGENT_UPDATE) {
      return (
        <>
          <AgentUpdate currentAgentId={part[ContentTypes.AGENT_UPDATE]?.agentId} />
          {isLast && showCursor && (
            <Container>
              <EmptyText />
            </Container>
          )}
        </>
      );
    } else if (part.type === 'agent_return') {
      const agentReturn = (part as { agent_return?: { agentId?: string; sourceAgentId?: string } })
        .agent_return;
      if (!agentReturn?.agentId || !agentReturn?.sourceAgentId) {
        return null;
      }
      return (
        <AgentReturn agentId={agentReturn.agentId} sourceAgentId={agentReturn.sourceAgentId} />
      );
    } else if (part.type === ContentTypes.TEXT) {
      const text = typeof part.text === 'string' ? part.text : part.text?.value;

      if (typeof text !== 'string') {
        return null;
      }
      if (part.tool_call_ids != null && !text) {
        return null;
      }
      /** Handle whitespace-only text to avoid layout shift */
      if (text.length > 0 && /^\s*$/.test(text)) {
        /** Show placeholder for whitespace-only last part during streaming */
        if (isLast && showCursor) {
          return (
            <Container>
              <EmptyText />
            </Container>
          );
        }
        /** Skip rendering non-last whitespace-only parts to avoid empty Container */
        if (!isLast) {
          return null;
        }
      }
      return (
        <Container>
          <Text text={text} isCreatedByUser={isCreatedByUser} showCursor={showCursor} />
        </Container>
      );
    } else if (part.type === ContentTypes.THINK) {
      const reasoning = typeof part.think === 'string' ? part.think : part.think?.value;
      if (typeof reasoning !== 'string') {
        return null;
      }
      return <Reasoning reasoning={reasoning} isLast={isLast ?? false} />;
    } else if (part.type === ContentTypes.TOOL_CALL) {
      const toolCall = part[ContentTypes.TOOL_CALL];

      if (!toolCall) {
        return null;
      }

      const isToolCall =
        'args' in toolCall && (!toolCall.type || toolCall.type === ToolCallTypes.TOOL_CALL);
      if (
        isToolCall &&
        (toolCall.name === Tools.execute_code ||
          toolCall.name === Constants.PROGRAMMATIC_TOOL_CALLING)
      ) {
        const argsStr =
          typeof toolCall.args === 'string'
            ? toolCall.args
            : toolCall.args != null
              ? JSON.stringify(toolCall.args)
              : '';
        return (
          <ExecuteCode
            attachments={attachments}
            isSubmitting={isSubmitting}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            args={argsStr}
            toolCallId={toolCall.id}
            toolName={toolCall.name != null ? String(toolCall.name) : undefined}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'image_gen_oai' ||
          toolCall.name === 'image_edit_oai' ||
          toolCall.name === 'gemini_image_gen')
      ) {
        return (
          <OpenAIImageGen
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            toolName={toolCall.name}
            args={typeof toolCall.args === 'string' ? toolCall.args : ''}
            output={toolCall.output ?? ''}
            attachments={attachments}
          />
        );
      } else if (isToolCall && toolCall.name === Tools.web_search) {
        return (
          <WebSearch
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            attachments={attachments}
            isLast={isLast}
          />
        );
      } else if (isToolCall && toolCall.name?.startsWith(Constants.LC_TRANSFER_TO_)) {
        return (
          <AgentHandoff
            args={toolCall.args ?? ''}
            name={toolCall.name || ''}
            output={toolCall.output ?? ''}
          />
        );
      } else if (isToolCall && (toolCall.name === Tools.project_switch || toolCall.name === 'project_switch')) {
        return (
          <ProjectSwitch
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
          />
        );
      } else if (isToolCall && toolCall.name === Tools.file_search) {
        return (
          <AgentFileSearch
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            attachments={attachments}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'drive_search' ||
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('drive_search_mcp_')))
      ) {
        return (
          <DriveSearch
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'gmail_search' ||
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('gmail_search_mcp_')))
      ) {
        return (
          <GmailSearch
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'gmail_get' ||
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('gmail_get_mcp_')))
      ) {
        return (
          <GmailGet
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'docs_create' ||
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('docs_create_mcp_')))
      ) {
        return (
          <DocsCreate
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'gmail_send')) {
        return (
          <GmailSend
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'gmail_sendDraft')) {
        return (
          <GmailSendDraft
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'send_user_email')) {
        return (
          <SendUserEmail
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'drive_createFolder')) {
        return (
          <DriveCreateFolder
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'drive_downloadFile')) {
        return (
          <DriveDownloadFile
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'tasks_listTasks' ||
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('tasks_listTasks_mcp_')))
      ) {
        return (
          <GoogleTasksList
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'tasks_listTaskLists' ||
          (typeof toolCall.name === 'string' &&
            toolCall.name.startsWith('tasks_listTaskLists_mcp_')))
      ) {
        return (
          <GoogleTaskLists
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'list-todo-tasks' ||
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('list-todo-tasks_mcp_')))
      ) {
        return (
          <MicrosoftTodoTasks
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'list-todo-task-lists' ||
          (typeof toolCall.name === 'string' &&
            toolCall.name.startsWith('list-todo-task-lists_mcp_')))
      ) {
        return (
          <MicrosoftTodoTaskLists
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'tasks_createTask' ||
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('tasks_createTask_mcp_')))
      ) {
        return (
          <GoogleTaskCreate
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'tasks_createTaskList' ||
          (typeof toolCall.name === 'string' &&
            toolCall.name.startsWith('tasks_createTaskList_mcp_')))
      ) {
        return (
          <GoogleTaskListCreate
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'tasks_updateTask' ||
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('tasks_updateTask_mcp_')))
      ) {
        return (
          <GoogleTaskUpdate
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'tasks_updateTaskList' ||
          (typeof toolCall.name === 'string' &&
            toolCall.name.startsWith('tasks_updateTaskList_mcp_')))
      ) {
        return (
          <GoogleTaskListUpdate
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'create-todo-task' ||
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('create-todo-task_mcp_')))
      ) {
        return (
          <MicrosoftTodoTaskCreate
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'update-todo-task' ||
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('update-todo-task_mcp_')))
      ) {
        return (
          <MicrosoftTodoTaskUpdate
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'tasks_deleteTask' ||
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('tasks_deleteTask_mcp_')))
      ) {
        return (
          <GoogleTaskDelete
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'tasks_deleteTaskList' ||
          (typeof toolCall.name === 'string' &&
            toolCall.name.startsWith('tasks_deleteTaskList_mcp_')))
      ) {
        return (
          <GoogleTaskListDelete
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        (toolCall.name === 'delete-todo-task' ||
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('delete-todo-task_mcp_')))
      ) {
        return (
          <MicrosoftTodoTaskDelete
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'calendar_list')) {
        return (
          <CalendarList
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'calendar_listEvents')) {
        return (
          <CalendarListEvents
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'calendar_createEvent')) {
        return (
          <CalendarCreateEvent
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'calendar_getEvent')) {
        return (
          <CalendarGetEvent
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'calendar_updateEvent')) {
        return (
          <CalendarUpdateEvent
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'calendar_deleteEvent')) {
        return (
          <CalendarDeleteEvent
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'calendar_respondToEvent')) {
        return (
          <CalendarRespondToEvent
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'calendar_findFreeTime')) {
        return (
          <CalendarFindFreeTime
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        [
          'list-calendar-events',
          'get-calendar-view',
          'get-specific-calendar-view',
          'list-calendar-event-instances',
          'list-specific-calendar-events',
        ].some(
          (b) =>
            toolCall.name === b ||
            (typeof toolCall.name === 'string' && toolCall.name.startsWith(`${b}_mcp_`)),
        )
      ) {
        return (
          <MSCalendarListEvents
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        ['get-calendar-event', 'get-specific-calendar-event'].some(
          (b) =>
            toolCall.name === b ||
            (typeof toolCall.name === 'string' && toolCall.name.startsWith(`${b}_mcp_`)),
        )
      ) {
        return (
          <MSCalendarGetEvent
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (
        isToolCall &&
        ['create-calendar-event', 'create-specific-calendar-event'].some(
          (b) =>
            toolCall.name === b ||
            (typeof toolCall.name === 'string' && toolCall.name.startsWith(`${b}_mcp_`)),
        )
      ) {
        return (
          <MSCalendarCreateEvent
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (
        isToolCall &&
        ['update-calendar-event', 'update-specific-calendar-event'].some(
          (b) =>
            toolCall.name === b ||
            (typeof toolCall.name === 'string' && toolCall.name.startsWith(`${b}_mcp_`)),
        )
      ) {
        return (
          <MSCalendarUpdateEvent
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (
        isToolCall &&
        ['delete-calendar-event', 'delete-specific-calendar-event'].some(
          (b) =>
            toolCall.name === b ||
            (typeof toolCall.name === 'string' && toolCall.name.startsWith(`${b}_mcp_`)),
        )
      ) {
        return (
          <MSCalendarDeleteEvent
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_list_pipelines')) {
        return (
          <CRMList
            itemType="pipelines"
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_list_contacts')) {
        return (
          <CRMList
            itemType="contacts"
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_list_organizations')) {
        return (
          <CRMList
            itemType="organizations"
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_list_deals')) {
        return (
          <CRMList
            itemType="deals"
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_list_activities')) {
        return (
          <CRMList
            itemType="activities"
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_create_pipeline')) {
        return (
          <CRMCard
            entityType="pipeline"
            action="create"
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_update_pipeline')) {
        return (
          <CRMCard
            entityType="pipeline"
            action="update"
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_create_contact')) {
        return (
          <CRMCard
            entityType="contact"
            action="create"
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_update_contact')) {
        return (
          <CRMCard
            entityType="contact"
            action="update"
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_get_contact')) {
        return (
          <CRMCard
            entityType="contact"
            action="get"
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_create_organization')) {
        return (
          <CRMCard
            entityType="organization"
            action="create"
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_get_organization')) {
        return (
          <CRMCard
            entityType="organization"
            action="get"
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_create_deal')) {
        return (
          <CRMCard
            entityType="deal"
            action="create"
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_update_deal')) {
        return (
          <CRMCard
            entityType="deal"
            action="update"
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_log_activity')) {
        return (
          <CRMLogActivity
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_soft_delete_contact')) {
        return (
          <CRMDelete
            entityType="contact"
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_soft_delete_organization')) {
        return (
          <CRMDelete
            entityType="organization"
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_soft_delete_deal')) {
        return (
          <CRMDelete
            entityType="deal"
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && isToolMatch(toolCall.name, 'crm_soft_delete_pipeline')) {
        return (
          <CRMDelete
            entityType="pipeline"
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            toolName={toolCall.name}
          />
        );
      } else if (isToolCall && toolCall.name === Tools.create_pdf) {
        return (
          <CreatePdf
            args={toolCall.args ?? ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            isLast={isLast}
            toolCallId={toolCall.id}
            attachments={attachments}
          />
        );
      } else if (isToolCall) {
        return (
          <ToolCall
            args={toolCall.args ?? ''}
            name={toolCall.name || ''}
            output={toolCall.output ?? ''}
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            attachments={attachments}
            auth={toolCall.auth}
            expires_at={toolCall.expires_at}
            isLast={isLast}
            showAuthButton={showAuthButton}
            toolCallId={toolCall.id}
          />
        );
      } else if (toolCall.type === ToolCallTypes.CODE_INTERPRETER) {
        const code_interpreter = toolCall[ToolCallTypes.CODE_INTERPRETER];
        return (
          <CodeAnalyze
            initialProgress={toolCall.progress ?? 0.1}
            code={code_interpreter.input}
            outputs={code_interpreter.outputs ?? []}
          />
        );
      } else if (
        toolCall.type === ToolCallTypes.RETRIEVAL ||
        toolCall.type === ToolCallTypes.FILE_SEARCH
      ) {
        return (
          <RetrievalCall initialProgress={toolCall.progress ?? 0.1} isSubmitting={isSubmitting} />
        );
      } else if (
        toolCall.type === ToolCallTypes.FUNCTION &&
        ToolCallTypes.FUNCTION in toolCall &&
        imageGenTools.has(toolCall.function.name)
      ) {
        return (
          <ImageGen
            initialProgress={toolCall.progress ?? 0.1}
            args={toolCall.function.arguments as string}
          />
        );
      } else if (toolCall.type === ToolCallTypes.FUNCTION && ToolCallTypes.FUNCTION in toolCall) {
        if (isImageVisionTool(toolCall)) {
          if (isSubmitting && showCursor) {
            return (
              <Container>
                <Text text={''} isCreatedByUser={isCreatedByUser} showCursor={showCursor} />
              </Container>
            );
          }
          return null;
        }

        const funcName = toolCall.function?.name;
        if (
          funcName === 'drive_search' ||
          (typeof funcName === 'string' && funcName.startsWith('drive_search_mcp_'))
        ) {
          return (
            <DriveSearch
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (funcName === Tools.file_search) {
          return (
            <AgentFileSearch
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              attachments={attachments}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (funcName === Tools.create_pdf) {
          return (
            <CreatePdf
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
              attachments={attachments}
            />
          );
        }
        if (
          funcName === 'gmail_search' ||
          (typeof funcName === 'string' && funcName.startsWith('gmail_search_mcp_'))
        ) {
          return (
            <GmailSearch
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (
          funcName === 'gmail_get' ||
          (typeof funcName === 'string' && funcName.startsWith('gmail_get_mcp_'))
        ) {
          return (
            <GmailGet
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (
          funcName === 'docs_create' ||
          (typeof funcName === 'string' && funcName.startsWith('docs_create_mcp_'))
        ) {
          return (
            <DocsCreate
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (
          funcName === 'gmail_send' ||
          (typeof funcName === 'string' && funcName.startsWith('gmail_send_mcp_'))
        ) {
          return (
            <GmailSend
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
              toolName={funcName}
            />
          );
        }
        if (
          funcName === 'gmail_sendDraft' ||
          (typeof funcName === 'string' && funcName.startsWith('gmail_sendDraft_mcp_'))
        ) {
          return (
            <GmailSendDraft
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
              toolName={funcName}
            />
          );
        }
        if (
          funcName === 'send_user_email' ||
          (typeof funcName === 'string' && funcName.startsWith('send_user_email_mcp_'))
        ) {
          return (
            <SendUserEmail
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
              toolName={funcName}
            />
          );
        }
        if (
          funcName === 'drive_createFolder' ||
          (typeof funcName === 'string' && funcName.startsWith('drive_createFolder_mcp_'))
        ) {
          return (
            <DriveCreateFolder
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
              toolName={funcName}
            />
          );
        }
        if (
          funcName === 'drive_downloadFile' ||
          (typeof funcName === 'string' && funcName.startsWith('drive_downloadFile_mcp_'))
        ) {
          return (
            <DriveDownloadFile
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (
          funcName === 'tasks_listTasks' ||
          (typeof funcName === 'string' && funcName.startsWith('tasks_listTasks_mcp_'))
        ) {
          return (
            <GoogleTasksList
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (
          funcName === 'tasks_listTaskLists' ||
          (typeof funcName === 'string' && funcName.startsWith('tasks_listTaskLists_mcp_'))
        ) {
          return (
            <GoogleTaskLists
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (
          funcName === 'list-todo-tasks' ||
          (typeof funcName === 'string' && funcName.startsWith('list-todo-tasks_mcp_'))
        ) {
          return (
            <MicrosoftTodoTasks
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (
          funcName === 'list-todo-task-lists' ||
          (typeof funcName === 'string' && funcName.startsWith('list-todo-task-lists_mcp_'))
        ) {
          return (
            <MicrosoftTodoTaskLists
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (
          funcName === 'tasks_createTask' ||
          (typeof funcName === 'string' && funcName.startsWith('tasks_createTask_mcp_'))
        ) {
          return (
            <GoogleTaskCreate
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (
          funcName === 'tasks_createTaskList' ||
          (typeof funcName === 'string' && funcName.startsWith('tasks_createTaskList_mcp_'))
        ) {
          return (
            <GoogleTaskListCreate
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (
          funcName === 'tasks_updateTask' ||
          (typeof funcName === 'string' && funcName.startsWith('tasks_updateTask_mcp_'))
        ) {
          return (
            <GoogleTaskUpdate
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (
          funcName === 'tasks_updateTaskList' ||
          (typeof funcName === 'string' && funcName.startsWith('tasks_updateTaskList_mcp_'))
        ) {
          return (
            <GoogleTaskListUpdate
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (
          funcName === 'create-todo-task' ||
          (typeof funcName === 'string' && funcName.startsWith('create-todo-task_mcp_'))
        ) {
          return (
            <MicrosoftTodoTaskCreate
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (
          funcName === 'update-todo-task' ||
          (typeof funcName === 'string' && funcName.startsWith('update-todo-task_mcp_'))
        ) {
          return (
            <MicrosoftTodoTaskUpdate
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (
          funcName === 'tasks_deleteTask' ||
          (typeof funcName === 'string' && funcName.startsWith('tasks_deleteTask_mcp_'))
        ) {
          return (
            <GoogleTaskDelete
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (
          funcName === 'tasks_deleteTaskList' ||
          (typeof funcName === 'string' && funcName.startsWith('tasks_deleteTaskList_mcp_'))
        ) {
          return (
            <GoogleTaskListDelete
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }
        if (
          funcName === 'delete-todo-task' ||
          (typeof funcName === 'string' && funcName.startsWith('delete-todo-task_mcp_'))
        ) {
          return (
            <MicrosoftTodoTaskDelete
              args={toolCall.function.arguments ?? ''}
              output={toolCall.function.output ?? ''}
              initialProgress={toolCall.progress ?? 0.1}
              isSubmitting={isSubmitting}
              isLast={isLast}
              toolCallId={toolCall.id}
            />
          );
        }

        return (
          <ToolCall
            initialProgress={toolCall.progress ?? 0.1}
            isSubmitting={isSubmitting}
            args={toolCall.function.arguments as string}
            name={toolCall.function.name}
            output={toolCall.function.output}
            isLast={isLast}
            showAuthButton={showAuthButton}
          />
        );
      }
    } else if (part.type === ContentTypes.IMAGE_FILE) {
      const imageFile = part[ContentTypes.IMAGE_FILE];
      const height = imageFile.height ?? 1920;
      const width = imageFile.width ?? 1080;
      return (
        <Image
          imagePath={imageFile.filepath}
          height={height}
          width={width}
          altText={imageFile.filename ?? 'Uploaded Image'}
          placeholderDimensions={{
            height: height + 'px',
            width: width + 'px',
          }}
        />
      );
    }

    return null;
  },
);

export default Part;
