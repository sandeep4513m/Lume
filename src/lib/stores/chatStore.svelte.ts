export const chatStore = new (class {
  messages = $state<any[]>([]);
  isLoading = $state(false);
  prompt = $state("");
  errorMessage = $state("");
  copiedIndex = $state(-1);
  currentAbortController = $state<AbortController | null>(null);
  isStreamingEnabled = $state(true);
  isThinkingEnabled = $state(true);

  setMessages(v: any[]) {
    this.messages = v;
  }

  setIsLoading(v: boolean) {
    this.isLoading = v;
  }

  setPrompt(v: string) {
    this.prompt = v;
  }

  setErrorMessage(v: string) {
    this.errorMessage = v;
  }

  setCopiedIndex(v: number) {
    this.copiedIndex = v;
  }

  setCurrentAbortController(v: AbortController | null) {
    this.currentAbortController = v;
  }

  setIsStreamingEnabled(v: boolean) {
    this.isStreamingEnabled = v;
  }

  setIsThinkingEnabled(v: boolean) {
    this.isThinkingEnabled = v;
  }
})();
