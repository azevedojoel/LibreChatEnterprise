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
import CodeAnalyze from './CodeAnalyze';
import Container from './Container';
import WebSearch from './WebSearch';
import DriveSearch from './DriveSearch';
import GmailSearch from './GmailSearch';
import GmailGet from './GmailGet';
import DocsCreate from './DocsCreate';
import DiscoverySearch from './DiscoverySearch';
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
import ToolCall from './ToolCall';
import ImageGen from './ImageGen';
import Image from './Image';

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
  ({ part, isSubmitting, attachments, isLast, showCursor, isCreatedByUser, showAuthButton = true }: PartProps) => {
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
      } else if (
        isToolCall &&
        (toolCall.name === Constants.TOOL_SEARCH ||
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('tool_search_mcp_')))
      ) {
        return (
          <DiscoverySearch
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
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('tasks_listTaskLists_mcp_')))
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
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('list-todo-task-lists_mcp_')))
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
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('tasks_createTaskList_mcp_')))
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
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('tasks_updateTaskList_mcp_')))
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
          (typeof toolCall.name === 'string' && toolCall.name.startsWith('tasks_deleteTaskList_mcp_')))
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
          funcName === Constants.TOOL_SEARCH ||
          (typeof funcName === 'string' && funcName.startsWith('tool_search_mcp_'))
        ) {
          return (
            <DiscoverySearch
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
