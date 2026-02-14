import React, { useMemo } from 'react';
import SearchApiKeyDialog from '~/components/SidePanel/Agents/Search/ApiKeyDialog';
import { useBadgeRowContext } from '~/Providers';

function ToolDialogs() {
  const { webSearch, searchApiKeyForm } = useBadgeRowContext();
  const { authData: webSearchAuthData } = webSearch;

  const {
    methods: searchMethods,
    onSubmit: searchOnSubmit,
    isDialogOpen: searchDialogOpen,
    setIsDialogOpen: setSearchDialogOpen,
    handleRevokeApiKey: searchHandleRevoke,
    badgeTriggerRef: searchBadgeTriggerRef,
    menuTriggerRef: searchMenuTriggerRef,
  } = searchApiKeyForm;

  const searchAuthTypes = useMemo(
    () => webSearchAuthData?.authTypes ?? [],
    [webSearchAuthData?.authTypes],
  );

  return (
    <SearchApiKeyDialog
      onSubmit={searchOnSubmit}
      authTypes={searchAuthTypes}
      isOpen={searchDialogOpen}
      onRevoke={searchHandleRevoke}
      register={searchMethods.register}
      onOpenChange={setSearchDialogOpen}
      handleSubmit={searchMethods.handleSubmit}
      triggerRefs={[searchMenuTriggerRef, searchBadgeTriggerRef]}
      isToolAuthenticated={webSearchAuthData?.authenticated ?? false}
    />
  );
}

export default ToolDialogs;
