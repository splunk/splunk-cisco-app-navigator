# Cisco Control Center App

## Directory Structure

The app follows a monorepo pattern similar to cisco-enterprise-networking-app:

```
cisco_control_center_app/
├── packages/
│   └── cisco-control-center-app/
│       ├── src/
│       │   └── main/
│       │       ├── resources/
│       │       │   ├── splunk/
│       │       │   │   ├── appserver/static/   # Splunk app static files
│       │       │   │   ├── default/            # app.conf, nav.conf
│       │       │   │   ├── bin/                # Scripts
│       │       │   │   └── static/             # Additional static assets
│       │       │   └── configs/
│       │       │       └── cards.json          # **Custom configuration file defining all product cards**
│       │       └── webapp/
│       │           ├── common/
│       │           │   ├── SearchBar.jsx       # Search component
│       │           │   └── CategoryFilter.jsx  # Category filter component
│       │           └── pages/
│       │               ├── start/
│       │               │   ├── App.jsx         # Main App component
│       │               │   └── render.jsx      # React entry point
│       │               └── products/
│       │                   ├── ProductsPage.jsx # Main product listing page
│       │                   └── ProductCard.jsx  # Individual product card component
│       ├── bin/                    # Build scripts
│       ├── package.json            # npm package config
│       ├── webpack.config.js       # Webpack build configuration
│       ├── .eslintrc.js            # ESLint config
│       ├── .babelrc.js             # Babel config
│       └── stylelint.config.js     # Stylelint config
├── lerna.json                      # Lerna monorepo config
├── package.json                    # Root package config
└── scripts/                        # Build and deployment scripts
```

## Key Differences from cisco-enterprise-networking-app

1. **No DCE Module**: Instead of using the complex DCE (Data Collection Engine) concept, we use a **simple, custom `cards.json` configuration file**
2. **Simplified Product Cards**: Each product card is defined as a JSON object in `configs/cards.json`
3. **Lightweight Components**: React components are more focused and less complex than the networking app

## Custom Cards Configuration

The `src/main/resources/configs/cards.json` file defines all product cards. Each card object includes:

```json
{
  "id": "unique_id",
  "name": "Product Name",
  "category": "security|networking|identity",
  "description": "Product description",
  "modern_app": "app-name",
  "legacy_app": "legacy-app-name",
  "latest_version": "1.0.0",
  "is_installed": false,
  "data_present": false,
  "cloud_support": true,
  "onprem_support": true,
  "dashboards": [{"name": "...", "id": "..."}],
  "search_keywords": ["keyword1", "keyword2"],
  "legacy_versions": [{...}],
  "health_status": "unknown|green|yellow|red",
  ...
}
```

## Building the App

```bash
# Install dependencies
yarn install

# Build the app
cd packages/cisco-control-center-app
yarn build

# Watch mode (development)
yarn start

# Package for deployment
yarn package:app
```

## Keys Features

- **Product Card Interface**: Each Cisco product is represented by an intelligent card
- **Universal Search**: Keyword-optimized search bar
- **Category Filtering**: Filter products by category
- **Legacy Debt Detection**: Identify deprecated and EOL apps  
- **Health Monitoring**: Real-time data flow and parse error detection
- **Version Management**: Track current vs. latest versions
- **One-Click Actions**: Launch, configure, or install apps directly

## Technology Stack

- **React 16.12** - Frontend framework
- **Webpack 5** - Module bundler
- **Babel 7** - JavaScript transpiler
- **Styled Components** - CSS-in-JS styling
- **Splunk UI Components** - @splunk/react-ui
- **Lerna** - Monorepo management
