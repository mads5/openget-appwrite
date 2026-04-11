"use client";

import { useEffect, useState } from "react";
import { account, OAuthProvider } from "@/lib/appwrite";
import { getMyGithubRepos, listRepo, delistRepo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GitHubRepoInfo } from "@/types";
import type { Models } from "appwrite";

export default function ListRepoPage() {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [repos, setRepos] = useState<GitHubRepoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [listing, setListing] = useState<string | null>(null);
  const [delisting, setDelisting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    account.get().then((u) => {
      setUser(u);
      getMyGithubRepos()
        .then(setRepos)
        .catch((err) =>
          setMessage(
            err instanceof Error ? err.message : "Could not fetch your repos. Try again later.",
          ),
        )
        .finally(() => setLoading(false));
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  const handleList = async (githubUrl: string) => {
    setListing(githubUrl);
    setMessage(null);
    try {
      const listed = await listRepo(githubUrl);
      setRepos((prev) =>
        prev.map((r) =>
          r.html_url === githubUrl
            ? { ...r, already_listed: true, listed_by_me: true, repo_id: listed.id }
            : r,
        ),
      );
      setMessage("Repo listed! We're discovering contributors now.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to list repo");
    } finally {
      setListing(null);
    }
  };

  const handleDelist = async (repo: GitHubRepoInfo) => {
    if (!repo.repo_id) return;
    setDelisting(repo.html_url);
    setMessage(null);
    try {
      await delistRepo(repo.repo_id);
      setRepos((prev) =>
        prev.map((r) =>
          r.html_url === repo.html_url
            ? { ...r, already_listed: false, listed_by_me: false, repo_id: null }
            : r,
        ),
      );
      setMessage("Repo delisted.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to delist repo");
    } finally {
      setDelisting(null);
    }
  };

  if (loading) {
    return (
      <div className="container py-20 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container py-20 text-center">
        <h2 className="text-2xl font-bold mb-4">Sign in to list your repo</h2>
        <p className="text-muted-foreground mb-6">
          Connect your GitHub account so we can see your repos and list them
          on OpenGet.
        </p>
        <Button
          onClick={() =>
            account.createOAuth2Session(
              OAuthProvider.Github,
              `${window.location.origin}/list-repo`,
              `${window.location.origin}/list-repo?auth_error=true`
            )
          }
        >
          Sign in with GitHub
        </Button>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">List Your Repo</h1>
        <p className="text-muted-foreground mt-1">
          Your GitHub repos sorted by stars. Click &quot;List&quot; to add one to
          OpenGet. We&apos;ll discover all contributors automatically.
        </p>
      </div>

      {message && (
        <div className="mb-6 p-4 rounded-lg border border-primary/30 bg-primary/5 text-sm">
          {message}
        </div>
      )}

      <div className="space-y-3">
        {repos.map((repo) => (
          <Card key={repo.html_url}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <span className="font-medium truncate">{repo.full_name}</span>
                  {repo.language && (
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {repo.language}
                    </Badge>
                  )}
                </div>
                {repo.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                    {repo.description}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  <span>&#9733; {repo.stargazers_count.toLocaleString()}</span>
                  <span>{repo.forks_count.toLocaleString()} forks</span>
                </div>
              </div>
              <div className="ml-4 shrink-0 flex items-center gap-2">
                {repo.already_listed ? (
                  <>
                    <Badge variant="secondary" className="bg-green-500/10 text-green-400 border-green-500/20">
                      Listed &#10003;
                    </Badge>
                    {repo.listed_by_me && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-400 border-red-500/30 hover:bg-red-500/10"
                        onClick={() => handleDelist(repo)}
                        disabled={delisting === repo.html_url}
                      >
                        {delisting === repo.html_url ? "Delisting..." : "Delist"}
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handleList(repo.html_url)}
                    disabled={listing === repo.html_url}
                  >
                    {listing === repo.html_url ? "Listing..." : "List This Repo"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {repos.length === 0 && !loading && (
          <div className="text-center py-12 text-muted-foreground">
            No repos found for your account.
          </div>
        )}
      </div>
    </div>
  );
}
