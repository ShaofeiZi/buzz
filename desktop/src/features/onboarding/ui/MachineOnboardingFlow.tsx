import * as React from "react";
import type { QueryClient } from "@tanstack/react-query";
import { ArrowUp } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import {
  getIdentity,
  importIdentity,
  persistCurrentIdentity,
} from "@/shared/api/tauriIdentity";
import type { IdentityStorage } from "@/shared/api/types";
import { Button } from "@/shared/ui/button";
import { StartupWindowDragRegion } from "@/shared/ui/StartupWindowDragRegion";
import { BackupStep } from "./BackupStep";
import { DefaultConfigStep } from "./DefaultConfigStep";
import { DownloadKeyStep } from "./DownloadKeyStep";
import {
  backupSessionToPasswordEntry,
  resetEncryptedBackupSession,
  useEncryptedBackupSession,
} from "./EncryptedBackupCreator";
import { IdentityKeyHelpDialog } from "./IdentityKeyHelpDialog";
import { LandingBees } from "./LandingBees";
import {
  NostrKeyImportForm,
  type NostrKeyImportStage,
} from "./NostrKeyImportForm";
import {
  ONBOARDING_LANDING_CTA_CLASS,
  ONBOARDING_SECONDARY_CTA_CLASS,
  OnboardingChrome,
} from "./OnboardingChrome";
import { OnboardingFooterProvider } from "./OnboardingFooter";
import { OnboardingSlideTransition } from "./OnboardingSlideTransition";
import { SetupStep } from "./SetupStep";
import type { DefaultConfigDraft } from "./types";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { LanguageSelector } from "@/shared/i18n/LanguageSelector";

export type MachineOnboardingPage =
  | "identity"
  | "key-import"
  | "backup"
  | "setup"
  | "config";

type BackupSubview = "created" | "options" | "password";

/** A pending navigation the parent should execute after RouterProvider mounts. */
export type PostOnboardingNavigation = {
  to: string;
  search?: Record<string, string>;
};

export function MachineOnboardingFlow({
  complete,
  continueWithIdentity,
  identityLost,
  initialPage,
  queryClient,
  navigateAfterComplete,
}: {
  complete: (pubkey?: string) => void;
  continueWithIdentity: (pubkey: string) => void;
  identityLost: boolean;
  initialPage?: MachineOnboardingPage;
  queryClient: QueryClient;
  /**
   * Called when the user finishes onboarding and requests navigation to a
   * specific route (e.g. Settings → Agents). The parent owns the RouterProvider,
   * so navigation must be deferred to it — calling router.navigate() here races
   * with RouterProvider mounting.
   */
  navigateAfterComplete?: (nav: PostOnboardingNavigation) => void;
}) {
  const { t } = useI18n();
  const [page, setPage] = React.useState<MachineOnboardingPage>(
    identityLost ? "key-import" : (initialPage ?? "identity"),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, setIsPending] = React.useState(false);
  const [identityWasImported, setIdentityWasImported] = React.useState(false);
  const [keyImportStage, setKeyImportStage] =
    React.useState<NostrKeyImportStage>("key-entry");
  const [selectedPubkey, setSelectedPubkey] = React.useState<string | null>(
    null,
  );
  const [identityStorage, setIdentityStorage] = React.useState<
    IdentityStorage | undefined
  >();
  const [readyRuntimeIds, setReadyRuntimeIds] = React.useState<string[]>([]);
  const [defaultConfigDraft, setDefaultConfigDraft] =
    React.useState<DefaultConfigDraft | null>(null);
  const [backupSubview, setBackupSubview] =
    React.useState<BackupSubview>("created");
  const [backupDirection, setBackupDirection] = React.useState<
    "forward" | "backward"
  >("forward");
  const [returningFromSecurity, setReturningFromSecurity] =
    React.useState(false);
  // Owned here so switching between the yellow onboarding view and the dark
  // security subview keeps the created backup, password, and test progress.
  const backupSession = useEncryptedBackupSession();
  const reduceMotion = useReducedMotion() ?? false;
  const isSecuritySubview = page === "backup" && backupSubview !== "created";
  const handleReadyRuntimeIdsChange = React.useCallback(
    (runtimeIds: readonly string[]) => {
      setReadyRuntimeIds(Array.from(new Set(runtimeIds)));
    },
    [],
  );

  const loadFreshIdentity = React.useCallback(async () => {
    setIsPending(true);
    setError(null);
    try {
      const identity = await getIdentity();
      queryClient.setQueryData(["identity"], identity);
      setSelectedPubkey(identity.pubkey);
      setIdentityStorage(identity.storage);
      setBackupDirection("forward");
      setReturningFromSecurity(false);
      setBackupSubview("created");
      setPage("backup");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("onboarding.loadIdentityFailed"),
      );
    } finally {
      setIsPending(false);
    }
  }, [queryClient, t]);

  const replaceLostIdentity = React.useCallback(async () => {
    const confirmed = window.confirm(t("onboarding.replaceIdentityConfirm"));
    if (!confirmed) return;

    setIsPending(true);
    setError(null);
    try {
      const identity = await persistCurrentIdentity();
      queryClient.setQueryData(["identity"], identity);
      setSelectedPubkey(identity.pubkey);
      setIdentityStorage(identity.storage);
      setBackupDirection("forward");
      setReturningFromSecurity(false);
      setBackupSubview("created");
      setPage("backup");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("onboarding.saveIdentityFailed"),
      );
    } finally {
      setIsPending(false);
    }
  }, [queryClient, t]);

  const importExistingIdentity = React.useCallback(
    async (nsec: string, password?: string) => {
      const identity = await importIdentity(nsec, password);
      continueWithIdentity(identity.pubkey);
      queryClient.setQueryData(["identity"], identity);
      setIdentityWasImported(true);
      setSelectedPubkey(identity.pubkey);
      setPage("setup");
    },
    [continueWithIdentity, queryClient],
  );

  return (
    <div
      className={`buzz-onboarding-neutral-theme buzz-startup-shell flex max-h-dvh items-start justify-center overflow-x-hidden overflow-y-auto px-4 text-foreground ${
        isSecuritySubview ? "buzz-onboarding-security-theme" : ""
      } ${
        page === "identity"
          ? "buzz-onboarding-welcome py-8"
          : "pb-28 pt-[106px]"
      }`}
      data-testid="machine-onboarding-gate"
    >
      <StartupWindowDragRegion />
      <div className="fixed right-6 top-8 z-30">
        <LanguageSelector compact />
      </div>
      {page === "identity" ? <LandingBees /> : null}
      {isSecuritySubview ? (
        <div className="fixed inset-x-0 top-8 z-20 flex justify-center px-6">
          <Button
            className={`${ONBOARDING_SECONDARY_CTA_CLASS} gap-2 px-5`}
            data-testid="backup-return-to-onboarding"
            onClick={() => {
              setBackupDirection("backward");
              setReturningFromSecurity(true);
              setBackupSubview("created");
            }}
            type="button"
            variant="ghost"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
            {t("onboarding.return")}
          </Button>
        </div>
      ) : page !== "identity" ? (
        <OnboardingChrome
          current={page === "config" ? 4 : page === "setup" ? 3 : 2}
        />
      ) : null}
      <OnboardingFooterProvider>
        <div
          className={`relative flex w-full max-w-[1040px] flex-col items-center text-center ${
            page === "identity" ? "my-auto" : "buzz-onboarding-step-frame"
          }`}
        >
          {page === "identity" ? (
            <OnboardingSlideTransition
              className="flex w-full max-w-[720px] flex-col items-center text-center"
              direction="forward"
              effect="mask-reveal-up"
              transitionKey="machine-identity"
            >
              <img
                alt="Buzz"
                className="w-full max-w-[600px]"
                src="/landing/buzz-wordmark.png"
              />
              <p className="mt-2 max-w-[560px] whitespace-pre-line text-center text-2xl font-normal leading-none text-foreground">
                {t("onboarding.tagline")}
              </p>
              {error ? (
                <p className="mt-4 text-sm text-destructive">{error}</p>
              ) : null}
              <div className="mt-10 flex flex-col items-center gap-3">
                <Button
                  className={ONBOARDING_LANDING_CTA_CLASS}
                  disabled={isPending}
                  onClick={() => void loadFreshIdentity()}
                  type="button"
                >
                  {isPending
                    ? t("onboarding.loadingIdentity")
                    : selectedPubkey
                      ? t("onboarding.continueSetup")
                      : t("onboarding.createIdentity")}
                </Button>
                <Button
                  className={`${ONBOARDING_SECONDARY_CTA_CLASS} px-5`}
                  disabled={isPending}
                  onClick={() => {
                    setKeyImportStage("key-entry");
                    setPage("key-import");
                  }}
                  type="button"
                  variant="ghost"
                >
                  {selectedPubkey
                    ? t("onboarding.useDifferentKey")
                    : t("onboarding.useExistingKey")}
                </Button>
              </div>
              <IdentityKeyHelpDialog />
            </OnboardingSlideTransition>
          ) : page === "key-import" ? (
            <OnboardingSlideTransition
              className="flex min-h-[calc(100dvh-13.25rem)] w-full max-w-[837px] flex-col items-center text-center"
              direction="forward"
              effect="fade"
              transitionKey="machine-key-import"
            >
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="shrink-0"
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                key={keyImportStage}
                transition={{
                  duration: reduceMotion ? 0 : 0.3,
                  ease: "easeOut",
                }}
              >
                <h1 className="text-title font-normal text-foreground">
                  {keyImportStage === "backup-password"
                    ? t("onboarding.unlockAccount")
                    : identityLost
                      ? t("onboarding.reimportKey")
                      : t("onboarding.enterPrivateKey")}
                </h1>
                <p className="mt-5 max-w-[440px] text-sm leading-6 text-foreground/80">
                  {keyImportStage === "backup-password"
                    ? t("onboarding.unlockDescription")
                    : identityLost
                      ? t("onboarding.reimportDescription")
                      : t("onboarding.privateKeyDescription")}
                </p>
              </motion.div>
              <div className="buzz-onboarding-key-import-position w-full">
                <NostrKeyImportForm
                  backLabel={
                    identityLost
                      ? t("onboarding.startNewIdentity")
                      : t("common.back")
                  }
                  onBack={
                    identityLost
                      ? () => void replaceLostIdentity()
                      : () => setPage("identity")
                  }
                  onImport={importExistingIdentity}
                  onStageChange={setKeyImportStage}
                  variant="spotlight"
                />
              </div>
            </OnboardingSlideTransition>
          ) : page === "backup" ? (
            backupSubview === "password" ? (
              <DownloadKeyStep
                direction={backupDirection}
                onBack={() => {
                  resetEncryptedBackupSession(backupSession);
                  setBackupDirection("backward");
                  setReturningFromSecurity(false);
                  setBackupSubview("options");
                }}
                session={backupSession}
              />
            ) : (
              <BackupStep
                direction={backupDirection}
                identityStorage={identityStorage}
                onBack={() => setPage("identity")}
                onNext={() => setPage("setup")}
                onOpenPasswordBackup={() => {
                  resetEncryptedBackupSession(backupSession);
                  setBackupDirection("forward");
                  setReturningFromSecurity(false);
                  setBackupSubview("password");
                }}
                onShowOptions={() => {
                  setBackupDirection("forward");
                  setReturningFromSecurity(false);
                  setBackupSubview("options");
                }}
                optionsExpanded={backupSubview === "options"}
                returningFromSecurity={returningFromSecurity}
              />
            )
          ) : page === "setup" ? (
            <SetupStep
              actions={{
                // Fresh-key users return to whichever identity backup subview
                // they used to reach setup; imported keys skip backup entirely.
                back: () => {
                  if (identityWasImported) {
                    setKeyImportStage("key-entry");
                    setPage("key-import");
                    return;
                  }
                  if (backupSubview === "password") {
                    backupSessionToPasswordEntry(backupSession);
                  }
                  setBackupDirection("backward");
                  setReturningFromSecurity(false);
                  setPage("backup");
                },
                next: (runtimeIds) => {
                  const ids = Array.from(runtimeIds);
                  setReadyRuntimeIds(ids);
                  // Harness install can fail (Windows/PATH/network). Don't soft-lock
                  // onboarding — users can finish setup later in Settings → Agents.
                  if (ids.length === 0) {
                    complete(selectedPubkey ?? undefined);
                    return;
                  }
                  setPage("config");
                },
                navigateToAgentSettings: () => {
                  // Complete onboarding first, then delegate the Settings → Agents
                  // navigation to the parent.  The parent owns RouterProvider, so
                  // navigation from within the onboarding flow races with the
                  // router mounting — calling router.navigate() here is unsafe.
                  complete(selectedPubkey ?? undefined);
                  navigateAfterComplete?.({
                    to: "/settings",
                    search: { section: "agents" },
                  });
                },
              }}
              direction="forward"
              onReadyRuntimeIdsChange={handleReadyRuntimeIdsChange}
            />
          ) : (
            <DefaultConfigStep
              actions={{
                back: () => setPage("setup"),
                complete: () => complete(selectedPubkey ?? undefined),
                discardDraft: () => setDefaultConfigDraft(null),
                updateDraft: setDefaultConfigDraft,
              }}
              direction="forward"
              draft={defaultConfigDraft}
              readyRuntimeIds={readyRuntimeIds}
            />
          )}
        </div>
      </OnboardingFooterProvider>
    </div>
  );
}
