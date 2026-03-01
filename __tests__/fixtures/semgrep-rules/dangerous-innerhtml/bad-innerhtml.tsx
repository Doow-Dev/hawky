/**
 * BAD: Unsafe dangerouslySetInnerHTML usage
 * These patterns should trigger hawky.security.dangerous-innerhtml-* rules
 */

import React from 'react';

interface Props {
  htmlContent: string;
  userContent: string;
}

interface ApiData {
  html: string;
  content: string;
}

// BAD: Variable without sanitization
function UnsafeContent({ htmlContent }: Props) {
  // ruleid: hawky.security.dangerous-innerhtml-variable
  return <div dangerouslySetInnerHTML={{ __html: htmlContent }} />;
}

// BAD: Props directly rendered
function PropsContent(props: Props) {
  // ruleid: hawky.security.dangerous-innerhtml-user-input
  return <div dangerouslySetInnerHTML={{ __html: props.htmlContent }} />;
}

// BAD: State content
class StatefulComponent extends React.Component<object, { content: string }> {
  state = { content: '<script>alert("xss")</script>' };

  render() {
    // ruleid: hawky.security.dangerous-innerhtml-user-input
    return <div dangerouslySetInnerHTML={{ __html: this.state.content }} />;
  }
}

// BAD: API response data
function ApiContent({ data }: { data: ApiData }) {
  // ruleid: hawky.security.dangerous-innerhtml-fetch-data
  return <div dangerouslySetInnerHTML={{ __html: data.html }} />;
}

// BAD: Query params
function QueryContent({ query }: { query: { html: string } }) {
  // ruleid: hawky.security.dangerous-innerhtml-user-input
  return <div dangerouslySetInnerHTML={{ __html: query.html }} />;
}

// BAD: Response object
function ResponseContent({ response }: { response: ApiData }) {
  // ruleid: hawky.security.dangerous-innerhtml-fetch-data
  return <article dangerouslySetInnerHTML={{ __html: response.content }} />;
}

// BAD: Local variable from external source
function ExternalContent() {
  const userInput = '<img src=x onerror=alert(1)>';
  // ruleid: hawky.security.dangerous-innerhtml-variable
  return <span dangerouslySetInnerHTML={{ __html: userInput }} />;
}

export {
  UnsafeContent,
  PropsContent,
  StatefulComponent,
  ApiContent,
  QueryContent,
  ResponseContent,
  ExternalContent,
};
