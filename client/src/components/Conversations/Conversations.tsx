import { useMemo, memo, type FC, useCallback, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import throttle from 'lodash/throttle';
import { ChevronDown, ListFilter } from 'lucide-react';
import { Spinner, TooltipAnchor, useMediaQuery } from '@librechat/client';
import { List, AutoSizer, CellMeasurer, CellMeasurerCache } from 'react-virtualized';
import type { TConversation } from 'librechat-data-provider';
import { useLocalize, TranslationKeys } from '~/hooks';
import { useActiveJobs } from '~/data-provider';
import { groupConversationsByDate, cn } from '~/utils';
import store from '~/store';
import Convo from './Convo';

export type CellPosition = {
  columnIndex: number;
  rowIndex: number;
};

export type MeasuredCellParent = {
  invalidateCellSizeAfterRender?: ((cell: CellPosition) => void) | undefined;
  recomputeGridSize?: ((cell: CellPosition) => void) | undefined;
};

interface ConversationsProps {
  conversations: Array<TConversation | null>;
  moveToTop: () => void;
  toggleNav: () => void;
  containerRef: React.RefObject<List>;
  loadMoreConversations: () => void;
  isLoading: boolean;
  isSearchLoading: boolean;
  isChatsExpanded: boolean;
  setIsChatsExpanded: (expanded: boolean) => void;
}

interface MeasuredRowProps {
  cache: CellMeasurerCache;
  rowKey: string;
  parent: MeasuredCellParent;
  index: number;
  style: React.CSSProperties;
  children: React.ReactNode;
}

/** Reusable wrapper for virtualized row measurement */
const MeasuredRow: FC<MeasuredRowProps> = memo(
  ({ cache, rowKey, parent, index, style, children }) => (
    <CellMeasurer cache={cache} columnIndex={0} key={rowKey} parent={parent} rowIndex={index}>
      {({ registerChild }) => (
        <div ref={registerChild as React.LegacyRef<HTMLDivElement>} style={style}>
          {children}
        </div>
      )}
    </CellMeasurer>
  ),
);

MeasuredRow.displayName = 'MeasuredRow';

const LoadingSpinner = memo(() => {
  const localize = useLocalize();

  return (
    <div className="mx-auto mt-2 flex items-center justify-center gap-2">
      <Spinner className="text-text-primary" />
      <span className="animate-pulse text-text-primary">{localize('com_ui_loading')}</span>
    </div>
  );
});

LoadingSpinner.displayName = 'LoadingSpinner';

interface ChatsHeaderProps {
  isExpanded: boolean;
  onToggle: () => void;
}

/** Collapsible header for the Chats section - structure matches SchedulesNav/ProjectNav */
const ChatsHeader: FC<ChatsHeaderProps> = memo(({ isExpanded, onToggle }) => {
  const localize = useLocalize();
  const selectedProjectId = useRecoilValue(store.selectedProjectIdAtom);
  return (
    <button
      onClick={onToggle}
      className="group flex w-full items-center justify-between rounded-lg px-1 py-2 text-sm font-bold text-text-secondary outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
      type="button"
    >
      <div className="flex items-center gap-0.5">
        <span className="select-none">{localize('com_ui_chats')}</span>
        {selectedProjectId && (
          <TooltipAnchor
            description={localize('com_ui_filtered_by_project')}
            side="top"
            className="inline-flex shrink-0"
          >
            <ListFilter className="h-3 w-3 text-text-secondary" aria-hidden />
          </TooltipAnchor>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <ChevronDown
          className={cn('h-3 w-3 transition-transform duration-200', isExpanded ? 'rotate-180' : '')}
        />
      </div>
    </button>
  );
});

ChatsHeader.displayName = 'ChatsHeader';

const DateLabel: FC<{ groupName: string; isFirst?: boolean }> = memo(({ groupName, isFirst }) => {
  const localize = useLocalize();
  return (
    <h2
      className={cn('pl-1 pt-1 text-text-secondary', isFirst === true ? 'mt-0' : 'mt-2')}
      style={{ fontSize: '0.7rem' }}
    >
      {localize(groupName as TranslationKeys) || groupName}
    </h2>
  );
});

DateLabel.displayName = 'DateLabel';

type FlattenedItem =
  | { type: 'header'; groupName: string }
  | { type: 'convo'; convo: TConversation }
  | { type: 'loading' };

const MemoizedConvo = memo(
  ({
    conversation,
    retainView,
    toggleNav,
    isGenerating,
  }: {
    conversation: TConversation;
    retainView: () => void;
    toggleNav: () => void;
    isGenerating: boolean;
  }) => {
    return (
      <Convo
        conversation={conversation}
        retainView={retainView}
        toggleNav={toggleNav}
        isGenerating={isGenerating}
      />
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.conversation.conversationId === nextProps.conversation.conversationId &&
      prevProps.conversation.title === nextProps.conversation.title &&
      prevProps.conversation.endpoint === nextProps.conversation.endpoint &&
      prevProps.isGenerating === nextProps.isGenerating
    );
  },
);

const Conversations: FC<ConversationsProps> = ({
  conversations: rawConversations,
  moveToTop,
  toggleNav,
  containerRef,
  loadMoreConversations,
  isLoading,
  isSearchLoading,
  isChatsExpanded,
  setIsChatsExpanded,
}) => {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const convoHeight = isSmallScreen ? 44 : 34;

  // Fetch active job IDs for showing generation indicators
  const { data: activeJobsData } = useActiveJobs();
  const activeJobIds = useMemo(
    () => new Set(activeJobsData?.activeJobIds ?? []),
    [activeJobsData?.activeJobIds],
  );

  const filteredConversations = useMemo(
    () => rawConversations.filter(Boolean) as TConversation[],
    [rawConversations],
  );

  const groupedConversations = useMemo(
    () => groupConversationsByDate(filteredConversations),
    [filteredConversations],
  );

  const flattenedItems = useMemo(() => {
    const items: FlattenedItem[] = [];

    if (isChatsExpanded) {
      groupedConversations.forEach(([groupName, convos]) => {
        items.push({ type: 'header', groupName });
        items.push(...convos.map((convo) => ({ type: 'convo' as const, convo })));
      });

      if (isLoading) {
        items.push({ type: 'loading' } as any);
      }
    }
    return items;
  }, [groupedConversations, isLoading, isChatsExpanded]);

  // Store flattenedItems in a ref for keyMapper to access without recreating cache
  const flattenedItemsRef = useRef(flattenedItems);
  flattenedItemsRef.current = flattenedItems;

  // Create a stable cache that doesn't depend on flattenedItems
  const cache = useMemo(
    () =>
      new CellMeasurerCache({
        fixedWidth: true,
        defaultHeight: convoHeight,
        keyMapper: (index) => {
          const item = flattenedItemsRef.current[index];
          if (!item) {
            return `unknown-${index}`;
          }
          if (item.type === 'header') {
            return `header-${item.groupName}`;
          }
          if (item.type === 'convo') {
            return `convo-${item.convo.conversationId}`;
          }
          if (item.type === 'loading') {
            return 'loading';
          }
          return `unknown-${index}`;
        },
      }),
    [convoHeight],
  );

  const rowRenderer = useCallback(
    ({ index, key, parent, style }) => {
      const item = flattenedItems[index];
      const rowProps = { cache, rowKey: key, parent, index, style };

      if (item.type === 'loading') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <LoadingSpinner />
          </MeasuredRow>
        );
      }

      if (item.type === 'header') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <DateLabel groupName={item.groupName} isFirst={index === 0} />
          </MeasuredRow>
        );
      }

      if (item.type === 'convo') {
        const isGenerating = activeJobIds.has(item.convo.conversationId ?? '');
        return (
          <MeasuredRow key={key} {...rowProps}>
            <MemoizedConvo
              conversation={item.convo}
              retainView={moveToTop}
              toggleNav={toggleNav}
              isGenerating={isGenerating}
            />
          </MeasuredRow>
        );
      }

      return null;
    },
    [
      cache,
      flattenedItems,
      moveToTop,
      toggleNav,
      isChatsExpanded,
      setIsChatsExpanded,
      activeJobIds,
    ],
  );

  const getRowHeight = useCallback(
    ({ index }: { index: number }) => cache.getHeight(index, 0),
    [cache],
  );

  const throttledLoadMore = useMemo(
    () => throttle(loadMoreConversations, 300),
    [loadMoreConversations],
  );

  const handleRowsRendered = useCallback(
    ({ stopIndex }: { stopIndex: number }) => {
      if (stopIndex >= flattenedItems.length - 8) {
        throttledLoadMore();
      }
    },
    [flattenedItems.length, throttledLoadMore],
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col pb-2 text-sm text-text-primary">
      {isSearchLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="text-text-primary" />
          <span className="ml-2 text-text-primary">{localize('com_ui_loading')}</span>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 flex-col">
          <div className="mb-1 shrink-0">
            <ChatsHeader
              isExpanded={isChatsExpanded}
              onToggle={() => setIsChatsExpanded(!isChatsExpanded)}
            />
          </div>
          <div className="min-h-0 flex-1">
            <AutoSizer>
              {({ width, height }) => (
                <List
                  ref={containerRef}
                  width={width}
                  height={height}
                  deferredMeasurementCache={cache}
                  rowCount={flattenedItems.length}
                  rowHeight={getRowHeight}
                  rowRenderer={rowRenderer}
                  overscanRowCount={10}
                  aria-readonly={false}
                  className="outline-none"
                  aria-label="Conversations"
                  onRowsRendered={handleRowsRendered}
                  tabIndex={-1}
                  style={{ outline: 'none', scrollbarGutter: 'stable' }}
                />
              )}
            </AutoSizer>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(Conversations);
