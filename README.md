# tymly-rankings-plugin
[![Tymly Plugin](https://img.shields.io/badge/tymly-plugin-blue.svg)](https://tymly.io/)
[![npm (scoped)](https://img.shields.io/npm/v/@wmfs/tymly-rankings-plugin.svg)](https://www.npmjs.com/package/@wmfs/tymly-rankings-plugin)
[![Build Status](https://travis-ci.org/wmfs/tymly-rankings-plugin.svg?branch=master)](https://travis-ci.org/wmfs/tymly-rankings-plugin)
[![codecov](https://codecov.io/gh/wmfs/tymly-rankings-plugin/branch/master/graph/badge.svg)](https://codecov.io/gh/wmfs/tymly-rankings-plugin)
[![CodeFactor](https://www.codefactor.io/repository/github/wmfs/tymly-rankings-plugin/badge)](https://www.codefactor.io/repository/github/wmfs/tymly-rankings-plugin)
[![Dependabot badge](https://img.shields.io/badge/Dependabot-active-brightgreen.svg)](https://dependabot.com/)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![license](https://img.shields.io/github/license/mashape/apistatus.svg)](https://github.com/wmfs/tymly/blob/master/packages/pg-concat/LICENSE)

> Plugin which handles ranking of data

On tymly startup, this plugin searches the loaded blueprints for .json files in ranking directory. These ranking files indicate what factors should contribute to the ranking score and where to find the value to score. The plugin looks at these factors, and finds the corresponding weights in the registry-keys. With these weights, the plugin generates an SQL View statement which forms a table with scores per factor and a total score for each 'source' row.

The plugin also supplies a state-resource so it can be called to refresh a ranking, which will look to the database for up-to-date registry-keys.

See the test blueprint in /test/fixtures for an example of how to do this.

## <a name="install"></a>Install
```bash
$ npm install tymly-rankings-plugin --save
```

## <a name="test"></a>Testing

Before running the tests, you'll need a test PostgreSQL database available and set a `PG_CONNECTION_STRING` environment variable to point to it, for example:

```PG_CONNECTION_STRING=postgres://postgres:postgres@localhost:5432/my_test_db```

Once the environment variables have been set, you can run the tests like this:

```bash
$ npm test
```


## <a name="license"></a>License

[MIT](https://github.com/wmfs/tymly/blob/master/LICENSE)
