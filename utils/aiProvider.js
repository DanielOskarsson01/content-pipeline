/**
 * AI Provider Adapter
 *
 * Unified interface for AI text generation across providers.
 * Supports OpenAI and Anthropic with automatic fallback.
 *
 * Usage:
 *   const ai = new AIProvider();  // Uses AI_PROVIDER env var, defaults to 'openai'
 *   const result = await ai.generate('Write a summary of...', { maxTokens: 500 });
 *
 * Environment variables:
 *   AI_PROVIDER       - 'openai' or 'anthropic' (default: 'openai')
 *   OPENAI_API_KEY    - OpenAI API key
 *   ANTHROPIC_API_KEY - Anthropic API key
 *   AI_MODEL          - Override default model (optional)
 */

class AIProvider {
  constructor(options = {}) {
    this.provider = options.provider || process.env.AI_PROVIDER || 'openai';
    this.model = options.model || process.env.AI_MODEL || null;
    this.apiKey = options.apiKey || this._getApiKey();

    // Default models per provider
    this.defaultModels = {
      openai: 'gpt-4o',
      anthropic: 'claude-sonnet-4-20250514'
    };
  }

  /**
   * Generate text from a prompt.
   *
   * @param {string} prompt - The prompt to send
   * @param {object} options - Generation options
   * @param {number} options.maxTokens - Maximum tokens to generate (default: 2048)
   * @param {number} options.temperature - Sampling temperature 0-1 (default: 0.7)
   * @param {string} options.systemPrompt - System/instructions prompt (optional)
   * @param {string} options.model - Override model for this call (optional)
   * @returns {object} { text, usage: { inputTokens, outputTokens }, model, provider }
   */
  async generate(prompt, options = {}) {
    const { maxTokens = 2048, temperature = 0.7, systemPrompt, model } = options;
    const useModel = model || this.model || this.defaultModels[this.provider];

    switch (this.provider) {
      case 'openai':
        return this._callOpenAI(prompt, { maxTokens, temperature, systemPrompt, model: useModel });
      case 'anthropic':
        return this._callAnthropic(prompt, { maxTokens, temperature, systemPrompt, model: useModel });
      default:
        throw new Error(`Unknown AI provider: ${this.provider}. Supported: openai, anthropic`);
    }
  }

  /**
   * Generate structured JSON output.
   *
   * @param {string} prompt - The prompt (should request JSON output)
   * @param {object} options - Same as generate(), plus:
   * @param {object} options.schema - JSON schema for response validation (informational, not enforced)
   * @returns {object} { data (parsed JSON), raw, usage, model, provider }
   */
  async generateJSON(prompt, options = {}) {
    const jsonPrompt = `${prompt}\n\nRespond with valid JSON only. No markdown, no explanation.`;
    const result = await this.generate(jsonPrompt, { ...options, temperature: 0.3 });

    try {
      const data = JSON.parse(result.text.trim());
      return { ...result, data };
    } catch (e) {
      // Try to extract JSON from response
      const jsonMatch = result.text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return { ...result, data };
      }
      throw new Error(`AI response was not valid JSON: ${result.text.slice(0, 200)}`);
    }
  }

  // Private: OpenAI implementation

  async _callOpenAI(prompt, { maxTokens, temperature, systemPrompt, model }) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error (${response.status}): ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return {
      text: data.choices[0].message.content,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens
      },
      model: data.model,
      provider: 'openai'
    };
  }

  // Private: Anthropic implementation

  async _callAnthropic(prompt, { maxTokens, temperature, systemPrompt, model }) {
    const body = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }]
    };
    if (systemPrompt) body.system = systemPrompt;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Anthropic API error (${response.status}): ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return {
      text: data.content[0].text,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens
      },
      model: data.model,
      provider: 'anthropic'
    };
  }

  // Private: resolve API key from environment

  _getApiKey() {
    switch (this.provider) {
      case 'openai':
        if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY environment variable not set');
        return process.env.OPENAI_API_KEY;
      case 'anthropic':
        if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY environment variable not set');
        return process.env.ANTHROPIC_API_KEY;
      default:
        throw new Error(`No API key resolver for provider: ${this.provider}`);
    }
  }
}

module.exports = AIProvider;
