import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { getMySubscription, type SubscriptionInfo } from "./sharedProjectApi";

type SubscriptionState = {
  data: SubscriptionInfo | null;
  loading: boolean;
  error: string | null;
};

let cachedState: SubscriptionState = { data: null, loading: false, error: null };
let inFlight: Promise<void> | null = null;
const subscribers = new Set<(state: SubscriptionState) => void>();

function setCachedState(next: SubscriptionState) {
  cachedState = next;
  for (const notify of subscribers) {
    notify(cachedState);
  }
}

async function load(): Promise<void> {
  if (inFlight) {
    return inFlight;
  }

  setCachedState({ ...cachedState, loading: true, error: null });

  inFlight = (async () => {
    try {
      const data = await getMySubscription();
      setCachedState({ data, loading: false, error: null });
    } catch (err) {
      setCachedState({
        data: null,
        loading: false,
        error: err instanceof Error ? err.message : "Unable to load subscription."
      });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

const FREE_LIMITS: SubscriptionInfo["limits"] = {
  maxProjects: null,
  maxSharesPerProject: null,
  allow3D: false
};

const EMPTY_USAGE: SubscriptionInfo["usage"] = { projectCount: 0 };

export function useSubscription() {
  const { isAuthenticated, isLoading } = useAuth0();
  const [state, setState] = useState<SubscriptionState>(cachedState);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    subscribers.add(setState);
    setState(cachedState);

    if (!cachedState.data && !cachedState.loading) {
      void load();
    }

    return () => {
      subscribers.delete(setState);
    };
  }, [isAuthenticated, isLoading]);

  const { data, loading, error } = state;
  const isPro = Boolean(data?.isPro) && !loading && !error;

  return {
    data,
    isPro,
    plan: (data?.plan ?? "free") as "free" | "pro",
    limits: data?.limits ?? FREE_LIMITS,
    usage: data?.usage ?? EMPTY_USAGE,
    loading,
    error,
    refresh: load
  };
}
