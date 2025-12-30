# Contributing to SupaSwarm

Thank you for your interest in contributing to SupaSwarm! This document provides guidelines and information for contributors.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to Contribute

### Reporting Bugs

1. **Search existing issues** to avoid duplicates
2. **Use the bug report template** when creating a new issue
3. **Include reproduction steps** and environment details
4. **Add screenshots** if relevant

### Suggesting Features

1. **Check the roadmap** and existing feature requests
2. **Use the feature request template**
3. **Explain the use case** and why it benefits users
4. **Be specific** about the proposed solution

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Follow the coding style** of the project
3. **Write clear commit messages**
4. **Update documentation** as needed
5. **Test your changes** before submitting

## Development Setup

### Prerequisites

- Node.js 18+
- A Supabase project
- Git

### Local Development

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/supaswarm.git
cd supaswarm

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your Supabase credentials

# Start development server
npm run dev
```

### Project Structure

```
src/
├── app/           # Next.js pages (App Router)
├── components/    # React components
│   └── ui/        # shadcn/ui components
└── lib/           # Utilities and types

supabase/
├── functions/     # Edge Functions
└── migrations/    # Database schema
```

## Coding Guidelines

### TypeScript

- Use TypeScript for all new code
- Define types for function parameters and returns
- Avoid `any` types when possible

### React Components

- Use functional components with hooks
- Keep components focused and composable
- Use shadcn/ui components for consistency

### Styling

- Use Tailwind CSS utility classes
- Follow existing color/spacing patterns
- Support both light and dark themes

### Naming Conventions

- **Files**: kebab-case (`task-message-thread.tsx`)
- **Components**: PascalCase (`TaskMessageThread`)
- **Functions**: camelCase (`fetchTaskById`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_MODEL`)

## Commit Messages

Use clear, descriptive commit messages:

```
feat: add agent handoff functionality
fix: resolve task status not updating in real-time
docs: update README with deployment instructions
chore: update dependencies
```

Prefixes:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `chore:` Maintenance
- `refactor:` Code refactoring
- `test:` Tests

## Pull Request Process

1. **Create a descriptive PR title**
2. **Fill out the PR template**
3. **Link related issues**
4. **Request review** from maintainers
5. **Address feedback** promptly
6. **Squash commits** if requested

### PR Checklist

- [ ] Code follows project style
- [ ] Self-reviewed the changes
- [ ] Added/updated documentation
- [ ] No new warnings or errors
- [ ] Tested locally

## Getting Help

- **GitHub Issues**: Bug reports and feature requests
- **Discussions**: Questions and ideas
- **Email**: joe@cloudbeast.io

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
