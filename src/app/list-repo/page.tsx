"use client";

import { useEffect, useState } from "react";
import { account } from "@/lib/appwrite";
import { startGithubOAuthSession } from "@/lib/oauth";
import { getMyGithubRepos, listRepo, delistRepo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/site/page-header";
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
      const fallback = "Failed to list repo. Please try again.";
      if (err instanceof Error && /temporarily unavailable/i.test(err.message)) {
        setMessage("OpenGet is temporarily unavailable while listing this repo. Please try again in a few seconds.");
      } else {
        setMessage(err instanceof Error ? err.message : fallback);
      }
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
      <div>
        <PageHeader
          title="List a repository"
          description="Connect GitHub so we can show repos you can add to the OpenGet index."
        />
        <div className="container py-12 text-center max-w-md mx-auto">
        <p className="text-muted-foreground mb-6">
          Sign in to load repositories you have access to and trigger contributor discovery.
        </p>
        <Button
          type="button"
          size="lg"
          onClick={(e) => {
            e.preventDefault();
            startGithubOAuthSession(account, "/list-repo", "/list-repo?auth_error=true");
          }}
        >
          Sign in with GitHub
        </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="List a repository"
        description="Add a repo to the OpenGet index. Nightly scoring discovers contributors and runs the 7-factor model."
      />
    <div className="container py-8">

      {message && (
        <div className="mb-6 p-4 rounded-lg border border-primary/30 bg-primary/5 text-sm">
          {message}
        </div>
      )}

      <div className="space-y-3">
        {repos.map((repo) => (
          <Card key={repo.html_url}>
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-1 text-xs text-muted-foreground">
                  <span>&#9733; {repo.stargazers_count.toLocaleString()}</span>
                  <span>{repo.forks_count.toLocaleString()} forks</span>
                </div>
              </div>
              <div className="shrink-0 flex w-full items-center justify-end gap-2 sm:ml-4 sm:w-auto">
                {repo.already_listed ? (
                  <>
                    <Badge variant="secondary" className="bg-green-500/10 text-green-400 border-green-500/20">
                      Listed &#10003;
                    </Badge>
                    {repo.listed_by_me && (
                      <Button
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
                    className="w-full sm:w-auto"
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
    </div>
  );
}
