# I18n

Developer can use internationalisation in backend.

For that call

```javascript
const I18n = require('@iobroker/i18n');

// later in "ready" method
await I18n.init(__dirname, adapter);
// If you use class syntax, you can use `this` instead of `adapter`
await I18n.init(__dirname, this);
// You can provide the language directly
await I18n.init(__dirname, 'de');
```

and then in code

```javascript
console.log(I18n.translate('text to translate %s', 'argument1'));
// or to get the ioBroker.Translated object
console.log(JSON.stringify(I18n.getTranslatedObject('text to translate %s and %s', 'argument1', 'argument2')));
```

You can place your `i18n` folder in root of adapter or in `lib` folder. If your `i18n` files are in `lib` directory, so call the `init` function like this:

```javascript
const { join } = require('node:path');
const I18n = require('@iobroker/i18n');

await I18n.init(join(__dirname, 'lib'), adapter);
```

Expected structure of `i18n` directory

```
+ i18n
  - de.json
  - en.json
  - es.json
  - fr.json
  - it.json
  - nl.json
  - pl.json
  - pt.json
  - ru.json
  - uk.json
  - zh-cn.json
```

And an example of i18n files could be found [here](test/i18n/de.json)

## Changelog

<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### 0.3.1 (2024-11-16)

-   (@GermanBluefox) Support root directory given as '.../i18n'

### 0.2.2 (2024-10-01)

-   (@GermanBluefox) Initial release

## MIT License

Copyright (c) 2024 @GermanBluefox <dogafox@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
