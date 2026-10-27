/**
 * Internal Regulations page (បទបញ្ជាផ្ទៃក្នុង) → Hostinger MySQL (tbl_internal_regulations).
 *
 * The document is an ordered list of blocks:
 *   CHAPTER (ជំពូក), SECTION (ផ្នែក), ARTICLE (ប្រការ / duties), NOTE (free paragraph).
 * Every signed-in user can read it; only ADMIN can add, edit, move or delete blocks.
 *
 * Served as actions on /api/remote-mysql (regulations_list, regulations_save, regulations_delete,
 * regulations_move) so it does not add another Vercel function.
 *
 * When the table is first created it is filled with the 2025 regulations (DEFAULT_BLOCKS).
 */
import { executeQuery } from './remote-mysql.js';

const T = 'tbl_internal_regulations';
const KINDS = ['CHAPTER', 'SECTION', 'ARTICLE', 'NOTE'];
const STEP = 10;

// Body text format (see RegulationsPage): "- " bullet, "-- " sub bullet, "### " sub heading,
// "! " highlighted note, **bold**; other lines are paragraphs.
const DEFAULT_BLOCKS = [
  ['NOTE', '', 'ដើម្បីរក្សាបាននូវភាពថ្លៃថ្នូរក្នុងសង្គម និង ការគ្រប់គ្រងឲ្យប្រសិទ្ធភាពខ្ពស់ ប្រធានក្រុមហ៊ុន និង ប្រធានប្រតិបត្តិ នៃក្រុមហ៊ុន បានសម្រេចជាឯកច្ឆ័ន្ទ រៀបចំច្បាប់សម្រាប់ក្រុមហ៊ុន ដើម្បីឲ្យបុគ្គលិកគ្រប់ផ្នែកទាំងអស់ គោរពប្រតិបត្តិឲ្យមានសណ្តាប់ធ្នាប់ របៀបរៀបរយល្អ និង ឲ្យសក្តិសមជាបុគ្គលិកល្អ ដែលមានចែងដូចតទៅនេះ ៖'],

  ['CHAPTER', 'ជំពូកទី១ ៖ បទបញ្ញត្តិទូទៅ', ''],
  ['ARTICLE', 'ប្រការ១', 'បុគ្គលិកគ្រប់រូប ត្រូវតែគោរព និងអនុវត្តយ៉ាងម៉ឺងម៉ាត់នូវ បទបញ្ជាផ្ទៃក្នុងរបស់ក្រុមហ៊ុន (IAL EXPRESS) ។'],
  ['ARTICLE', 'ប្រការ២', 'គ្មានឃ្លា ឬប្រយោគណាមួយនៃបទបញ្ជាផ្ទៃក្នុងនេះ ត្រូវបានយកមកបកស្រាយខុសពីការពិតឡើយ។\nចំពោះចំណុចមួយចំនួន ដែលមានចំណុចណាយល់មិនច្បាស់ បុគ្គលិកត្រូវមកសួរបញ្ជាក់ដោយផ្ទាល់ជាមួយ ប្រធានប្រតិបត្តិ និង ប្រធានបច្ចេកទេសផ្នែកនីមួយៗ ។'],
  ['ARTICLE', 'ប្រការ៣', 'ការប្រព្រឹត្តខុសពីបទបញ្ជាផ្ទៃក្នុងនេះ នឹងត្រូវទទួលពិន័យ តាមការកំណត់របស់ក្រុមហ៊ុន។'],

  ['CHAPTER', 'ជំពូកទី២', ''],
  ['SECTION', 'ផ្នែកទី១ ឯកសណ្ឋាន', ''],
  ['ARTICLE', 'ប្រការ៤', 'បុគ្គលិកទាំងពីរភេទត្រូវស្លៀកពាក់ឯកសណ្ឋានដែលកំណត់ដោយក្រុមហ៊ុន ៖\n- I. បុគ្គលិកស្រីត្រូវមានឯកសណ្ឋានបុគ្គលិក អាវសឺកក្នុងសំពត់ រឺ ខោ ព្រមទាំងពាក់កាតសំគាល់ខ្លួនជាប្រចាំ។\n- II. បុគ្គលិកប្រុសត្រូវមានឯកសណ្ឋានបុគ្គលិករបស់ក្រុមហ៊ុន អាវសឺកក្នុងខោ ព្រមទាំងពាក់កាតសម្គាល់ខ្លួនជាប្រចាំ ។ **ហាមដាច់ខាតការប្រើប្រាស់ស្បែកជើងសង្រែក ឬ ផ្ទាត់។**'],

  ['SECTION', 'ផ្នែកទី២ អំពីសីលធម៌ និង ភារកិច្ច កាតព្វកិច្ចរបស់បុគ្គលិក', ''],
  ['ARTICLE', 'ប្រការ៥', 'បុគ្គលិកទាំងអស់ត្រូវ ៖\n- ទំនាក់ទំនងល្អជាមួយអតិថិជន។\n- ថ្នាក់ដឹកនាំ។\n- មិត្តរួមការងារ។\n- ស្មារតីសម្របសម្រួល និង អធ្យាស្រ័យគ្នា ក្នុងការដោះស្រាយពេលមានបញ្ហា។\n- មានភាពស្មោះត្រង់ និង សេចក្តីថ្លៃថ្នូរជានិច្ច។\n- បុគ្គលិកទាំងអស់មិនអនុញ្ញាតិឲ្យយករឿងក្នុងរបស់ក្រុមហ៊ុន ទៅនិយាយប្រាប់អ្នកដ៏ទៃក្រៅពីបុគ្គលិកក្រុមហ៊ុនទេ។'],
  ['ARTICLE', 'បុគ្គលិកផ្នែក PICK UP', 'បុគ្គលិកទាំងអស់ត្រូវទទួលខុសត្រូវចំពោះការងាររបស់ខ្លួន ក្នុងការបំពេញឯកសារ (BILL) ជូនអតិថិជន ដូចខាងក្រោម ៖\n- ឈ្មោះអ្នកផ្ញើ អាសយដ្ឋាន លេខទំនាក់ទំនង\n- ឈ្មោះអ្នកទទួល អាសយដ្ឋាន លេខទំនាក់ទំនង\n- លក្ខណៈនៃការទូទាត់ប្រាក់\n- ឈ្មោះទំនិញ ទំហំកេះ គោលដៅ (DESTINATION) ដែលត្រូវបញ្ជូនទៅ\n- ត្រូវមានភាពរស់រាយរាក់ទាក់ចំពោះភ្ញៀវរាល់ពេលទៅយកឥវ៉ាន់ មិនត្រូវបញ្ចេញនូវកាយវិការណាមួយដែលមិនសមរម្យឡើយ។\n- មិនមានសិទ្ធិក្នុងការទទួលយកថ្លៃសេវាពីអតិថិជនឡើយ លើកលែងតែមានការអនុញ្ញាតពីប្រធានផ្នែក ។\n### ត្រូវមានសម្ភារៈគ្រប់យ៉ាងតាមខ្លួន ត្រៀមសំរាប់យកទំនិញដូចជា\n- វិក្កយប័ត្រ\n- ម៉ែត្រ\n- ជញ្ជីង\n- ខ្សែរសម្រាប់ចងឥវ៉ាន់\n- សម្ភារៈការពារពេលមានភ្លៀង'],
  ['ARTICLE', 'បុគ្គលិកផ្នែក ACCOUNT', '- ផ្ញើរបញ្ជីជូនអតិថិជនអោយបានលឿនទាន់ពេលកំណត់\n- ប្រមូលប្រាក់តាមពេលកំណត់\n- ទូទាត់ម្ចាស់បំណុលឲ្យទៀងទាត់ពេល'],
  ['ARTICLE', 'បុគ្គលិកផ្នែក OPERATION', '- បុគ្គលិក Operation ទាំងអស់ត្រូវធ្វើការដោយយកចិត្តទុកដាក់ មិនត្រូវអោយមានការបញ្ជូនឥវ៉ាន់ឬឯកសារខុសប្រទេសឡើយ។ ករណីមានការបញ្ជូនឥវ៉ាន់ឬឯកសារខុសប្រទេស នឹងត្រូវទទួលខុសត្រូវចំពោះកំហុសរបស់ខ្លួន១០០%។\n- បុគ្គលិកទាំងអស់ត្រូវត្រួតពិនិត្យឥវ៉ាន់ឬឯកសារអោយបានម៉ត់ចត់ មុននឹងបញ្ជូនទៅតាមទិសដៅរបស់ឥវ៉ាន់ឬឯកសារ ជៀសវាងមានរបស់ខុសច្បាប់នៅក្នុងឥវ៉ាន់ឬឯកសារ។\n- បុគ្គលិក Operation ត្រូវត្រួតពិនិត្យដំណើរការនៃការបញ្ជូនឥវ៉ាន់ឬឯកសារ តាមប្រព័ន្ធអ៊ីនធឺណែតអោយបានម៉ត់ចត់និងទៀងទាត់ គិតចាប់តាំងពីការទទួលឥវ៉ាន់ឬឯកសារពីអ្នកផ្ញើ រហូតដល់បានបញ្ជូនឥវ៉ាន់ឬឯកសារទៅអោយអ្នកទទួលបានជោគជ័យ១០០%។ ករណីឥវ៉ាន់ឬឯកសារមានបញ្ហាមិនប្រក្រតី ត្រូវផ្តល់ព័ត៌មានជូនផ្នែក SALES និងអតិថិជនអោយបានទាន់ពេលវេលា។\n- បុគ្គលិក Operation ត្រូវធ្វើរបាយការណ៍ចំនួនឥវ៉ាន់ឬឯកសារដែលទទួលពីអតិថិជនរាល់ថ្ងៃជាប្រចាំ ដើម្បីផ្ទៀងផ្ទាត់ជាមួយរបាយការណ៍របស់គណនេយ្យ ជៀសវាងបាត់ចំនួនឥវ៉ាន់ឬឯកសារ។\n- ផ្តល់ព័ត៌មានទំនិញនាំចេញ និងចូលឲ្យទាន់ពេលវេលាក្នុង website របស់ក្រុមហ៊ុន។'],
  ['ARTICLE', 'បុគ្គលិកផ្នែក CUSTOMER SERVICE', '- ត្រូវមានអត្តចរិកសុភាពរាបសារ រួសរាយក្នុងការនិយាយជាមួយអតិថិជនជានិច្ច។\n- ព័ត៌មានដែលផ្តល់ជូនអតិថិជនត្រូវច្បាស់លាស់។\n- ត្រូវបំពេញវិក័យប័ត្រសំរាប់បញ្ជូនទំនិញអោយត្រឹមត្រូវ ដូចជា ៖\n-- ទំងន់\n-- ប្រភេទទំនិញ\n-- ចំនួនឥវ៉ាន់\n-- ទិសដៅដែលត្រូវបញ្ជូន\n! បើករណីមានកំហុសកើតឡើងដោយអចេតនា ក្រុមហ៊ុននឹងជួយ៥០%នៃចំណាយ តែបើកើតឡើងដោយចេតនា ក្រុមហ៊ុននឹងអោយសង១០០%លើចំណាយ ។'],
  ['ARTICLE', 'បុគ្គលិកផ្នែក SALES', '- បុគ្គលិក SALES ទាំងអស់ត្រូវរៀបចំខ្លួនអោយបានស្អាតបាត និងមានសំលៀកបំពាក់សមរម្យ និងរស់រាយរាក់ទាក់ជានិច្ច។\n- រាល់តម្លៃទាំងអស់គ្រប់ SALES មិនត្រូវអោយភ្ញៀវឬដៃគូប្រកួតប្រជែង បានដឹងពីតម្លៃរបស់ក្រុមហ៊ុនឡើយ ។\n- បុគ្គលិក SALES មិនមានសិទ្ធិក្នុងការទទួលយកថ្លៃសេវាពីអតិថិជនឡើយ លើកលែងតែមានការអនុញ្ញាតពីប្រធានផ្នែក ។'],
  ['ARTICLE', 'បុគ្គលិកផ្នែក រៀបចំឥវ៉ាន់ វេនយប់', '- បុគ្គលិកទាំងអស់ធ្វើការងារដោយការប្រុងប្រយ័ត្ន ជៀសវាងការរៀបចំឥវ៉ាន់ច្រលំខេត្ត។ ករណីមានការច្រលំកើតឡើង បុគ្គលនោះនឹងត្រូវទទួលខុសត្រូវទាំងស្រុងលើកំហុសរបស់ខ្លួន។\n- បុគ្គលិកទាំងអស់មិនអាចសុំច្បាប់ចេញមុនម៉ោងលើសពី២ដងទេ។ ក្នុងការសុំច្បាប់ត្រូវផ្តល់ដំណឹងជូនប្រធានផ្នែកមុនចំនួន៣ថ្ងៃជាមុន។ លើកលែងតែការឈឺ, សាច់ញាតិមរណៈ។\n- មុននឹងចេញទៅផ្ទះ បុគ្គលិកទាំងអស់ត្រូវត្រួតពិនិត្យអោយបានគ្រប់ជ្រុងជ្រោយ ជៀសវាងរៀបចំឥវ៉ាន់មិនអស់។'],
  ['ARTICLE', 'បុគ្គលិកផ្នែក រៀបចំឥវ៉ាន់ វេនព្រឹក', '- បុគ្គលិកត្រូវរៀបចំឥវ៉ាន់ឲ្យត្រូវតាមតំបន់ ចំពោះឥវ៉ាន់ដែលបញ្ជូនទៅតាមស្រុក ឬទៅអតិថិជនផ្ទាល់ ត្រូវទំនាក់ទំនងទៅអតិថិជនជាមុនសិន មុននឹងបញ្ជូន ជៀសវាងការបញ្ជូនខុសអតិថិជន។ ករណីមានការច្រលំកើតឡើង បុគ្គលនោះនឹងត្រូវទទួលខុសត្រូវចំពោះការចំណាយលើកំហុសរបស់ខ្លួន។'],
  ['ARTICLE', 'បុគ្គលិកផ្នែក DRIVER', '- អ្នកបើកបរទាំងអស់ត្រូវមានចរិកស្លូតបូត និងព្យាយាមក្នុងការងារ។\n- ត្រូវលាងឡានមួយសប្តាហ៍អោយបាន២ដង។\n- មុននឹងចេញដំណើរ ត្រូវត្រួតពិនិត្យឡានអោយបានម៉ត់ចត់ ជៀសវាងខូចតាមផ្លូវ។\n- មិនត្រូវអោយអ្នកផ្សេងជិះក្រៅពីម្ចាស់ឡានឡើយ។\n- ឡានត្រូវចតអោយមានសណ្តាប់ធ្នាប់ និងរបៀបរាបរយ។\n- បុគ្គលិកទាំងអស់មិនមានសិទ្ធជិះឡានក្រៅម៉ោងការងារឡើយ លើកលែងតែមានការអនុញ្ញាតពីប្រធានផ្នែក។\n- ត្រូវត្រួតពិនិត្យសោរឡាន និងទ្វារអោយបានជិត មុននឹងចេញពីឡាន។\n- មិនអនុញ្ញាតិឲ្យប្រើប្រាស់គ្រឿងញៀន, សេពគ្រឿងស្រវឹងនៅម៉ោងធ្វើការ ឬពេលសម្រាកដែលអាចពាក់ព័ន្ធដល់ការធ្វើដំណើរនៅថ្ងៃបន្ទាប់។'],
  ['ARTICLE', 'បុគ្គលិកផ្នែក ស្នាក់នៅឃ្លាំង និង អ្នកស្នាក់នៅកន្លែងធ្វើការ', '- បុគ្គលិកទាំងអស់ត្រូវបោសសំអាតបន្ទប់ផ្ទាល់ខ្លួន និងឃ្លាំងជាប្រចាំ។\n- ត្រូវមានសណ្តាប់ធ្នាប់ក្នុងការរស់នៅ មិនត្រូវផឹកស៊ីឡូឡានៅកន្លែងស្នាក់ ឬបង្កសកម្មភាពណាមួយដែលខុសច្បាប់ឡើយ។ បើករណីប្រព្រឹត្តអំពើខុសច្បាប់ ក្រុមហ៊ុននឹងបញ្ជូនបុគ្គលនោះទៅសមត្ថកិច្ចដោះស្រាយតាមផ្លូវច្បាប់។\n- បុគ្គលិកទាំងអស់ត្រូវងូតទឹក និងបោកសំលៀកបំពាក់ក្នុងបន្ទប់ទឹក។\n- មុនចេញពីបន្ទប់ ត្រូវបិទភ្លើង និងចាក់សោរអោយបានត្រឹមត្រូវ។\n- ត្រូវថែរក្សាសំភារៈក្នុងកន្លែងស្នាក់នៅអោយបានល្អ បើមានការខូចខាតដោយចេតនា នឹងត្រូវទទួលខុសត្រូវ១០០%។\n- បុគ្គលិកទាំងអស់ត្រូវចេញចូលកន្លែងស្នាក់នៅតាមម៉ោងកំណត់របស់ក្រុមហ៊ុន។\n! ប្រសិនបើបុគ្គលិកណាមួយមិនគោរពតាមគោលការណ៍ខាងលើទេ នោះក្រុមហ៊ុននឹងមិនអនុញ្ញាតអោយស្នាក់នៅបន្តទៀតឡើយ។'],

  ['SECTION', 'ផ្នែកទី៣ អំពីពេលវេលាបម្រើការងារ', ''],
  ['ARTICLE', 'ប្រការ៦', 'បុគ្គលិកទាំងអស់ត្រូវតែចេញចូលត្រូវគោរពតាមពេលវេលា **ពេលព្រឹកត្រូវចូលធ្វើការមុន១៥នាទី**\n### បុគ្គលិកផ្នែក ACCOUNT\n- ពេលព្រឹក ម៉ោង ០៨:០០am ដល់ ១២:០០pm\n- ពេលរសៀល ម៉ោង ១៤:០០pm ដល់ ១៧:៣០pm\n### បុគ្គលិកផ្នែក SALES\n- ពេលព្រឹក ម៉ោង ០៨:០០am ដល់ ១២:០០pm\n- ពេលរសៀល ម៉ោង ១៤:០០pm ដល់ ១៧:៣០pm\n### បុគ្គលិកផ្នែក CS\n- ពេលព្រឹក ម៉ោង ០៨:០០am ដល់ ១២:០០pm\n- ពេលរសៀល ម៉ោង ១៤:០០pm ដល់ ១៧:០០pm\n### បុគ្គលិកផ្នែក PICK UP\n- ពេលព្រឹក ម៉ោង ០៨:០០am ដល់ ១២:០០pm\n- ពេលរសៀល ម៉ោង ១៤:០០pm ដល់ ១៧:៣០pm\n! បុគ្គលិកគ្រប់ផ្នែកទាំងអស់ត្រូវបញ្ចប់ការងាររបស់ខ្លួនឲ្យរួចរាល់ មុនពេលចាកចេញពីក្រុមហ៊ុន មិនត្រូវទុកចោលពាក់កណ្តាលទីឡើយ ។'],
  ['ARTICLE', 'ប្រការ៧', 'បុគ្គលិកដែលបានចរចារពេលវេលានៅពេលសំភាសន៍រួច អាចគោរពតាមអ្វីដែលបានចរចារ ។'],
  ['ARTICLE', 'ប្រការ៨', 'បើមានការផ្លាស់វេន ត្រូវមានការអនុញ្ញាតពីប្រធានផ្នែកប្រតិបត្តិ រឺប្រធានបច្ចេកទេសផ្នែកនីមួយៗ ។'],

  ['SECTION', 'ផ្នែកទី៤ អំពីអនាម័យ', ''],
  ['ARTICLE', 'ប្រការ៩', 'ជួយសំអាតគ្រប់ពេលវេលា នៅទីកន្លែងធ្វើការ និងស្នាក់នៅ ។'],
  ['ARTICLE', 'ប្រការ១០', 'ជួយរក្សាអនាម័យកន្លែងធ្វើការ បន្ទប់ទឹក ។ល។'],

  ['CHAPTER', 'ជំពូកទី៣ ៖ វិធានការរដ្ឋបាល និង ការលើកទឹកចិត្ត', ''],
  ['SECTION', 'ផ្នែកទី១ បម្រើការងារ', ''],
  ['ARTICLE', 'ប្រការ១១', 'បុគ្គលិកគ្រប់រូបដែលប្រព្រឹត្តផ្ទុយនឹងមាត្រាណាមួយ នឹងត្រូវទទួលវិធានការរដ្ឋបាលពីប្រធានប្រតិបត្តិ នៃក្រុមហ៊ុន (IAL EXPRESS) ។'],
  ['ARTICLE', 'ប្រការ១២', 'ករណីអវត្តមានគ្មានច្បាប់ ៖\n- ក/ ករណីក្នុងមួយដង ត្រូវកាត់ប្រាក់ **៤០០០០រៀល** រឺ តម្លៃស្មើប្រាក់ខែ២ថ្ងៃ ។\n- ខ/ ករណីអវត្តមានគ្មានច្បាប់ លើសពី៣ដងឡើងទៅ ត្រូវបញ្ឈប់ពីការងារភ្លាមៗ ឬត្រូវទទួលពិន័យពីក្រុមប្រឹក្សាវិន័យ ។'],
  ['ARTICLE', 'ប្រការ១៣', 'ករណីអវត្តមានមានច្បាប់ ៖\n- ក/ អវត្តមានមួយដង ត្រូវកាត់ **២០០០០រៀល** ក្នុងថ្ងៃ ឬតម្លៃស្មើប្រាក់ខែមួយថ្ងៃ ។\n- ខ/ ករណីដែលបុគ្គលិកឈឺ ក្រុមហ៊ុននឹងមិនកាត់ប្រាក់ខែឡើយ តែត្រូវមានលិខិតបញ្ជាក់ពីមន្ទីរពេទ្យ។'],
  ['ARTICLE', 'ប្រការ១៤', 'ករណីថ្ងៃឈប់សម្រាកផ្សេងៗ បុគ្គលិកអាចប្តូរវេនគ្នាបាន បើសិនមានករណីចាំបាច់។'],
  ['SECTION', 'ផ្នែកទី២ កំហុសការងារ', ''],
  ['ARTICLE', 'ប្រការ១៥', 'កម្រិតនៃការពិន័យ ៖\n- ក/ បើសិនមានកំហុសដោយចេតនា ក្រុមហ៊ុននឹងឲ្យចេញសងថ្លៃខូចខាត១០០% ។\n- ខ/ បើសិនមានកំហុសដោយអចេតនា ក្រុមហ៊ុនអាចជួយចេញសំណង៥០% នៃថ្លៃខូចខាត ។\n- គ/ ត្រូវចូលរួមក្នុងការដោះស្រាយបញ្ហាដោយការទទួលខុសត្រូវ ។'],
  ['SECTION', 'ផ្នែកទី៣', ''],
  ['ARTICLE', 'ត្រូវគោរពតាមគោលការណ៍ ភូមិឃុំមានសុវត្ថិភាព', '- ១. មានសកម្មភាពលួច ឆក់ប្លន់ គ្រប់ប្រភេទ។\n- ២. មានការដាំដុះ ការផលិតកម្មវិធី ការចរាចរ ការជួញដូរ ការចែកចាយ និងការប្រើប្រាស់គ្រឿងញៀនខុសច្បាប់។\n- ៣. មានអំពើអាណាចារ្យ ការជួញដូរស្ត្រី និងកុមារ និងអំពើហិង្សាក្នុងគ្រួសារ។\n- ៤. មានក្មេងទំនើង។\n- ៥. គ្មានការលេងល្បែងស៊ីសងខុសច្បាប់គ្រប់ប្រភេទ, ការប្រើប្រាស់អាវុធខុសច្បាប់គ្រប់ប្រភេទ និងបទល្មើសគ្រប់ប្រភេទ។\n- ៦. គ្មានគ្រោះថ្នាក់ចរាចរណ៍។\n- ៧. គ្មានគ្រោះថ្នាក់ដោយគ្រាប់យុទ្ធភ័ណ្ឌមិនទាន់ផ្ទុះ។\n- ៨. គ្មានការត្រួតពិនិត្យខុសច្បាប់។'],
  ['SECTION', 'ផ្នែកទី៤ ការលើកទឹកចិត្ត', ''],
  ['ARTICLE', 'ប្រការ១៦', 'កម្រិតនៃការលើកទឹកចិត្ត ៖\n- ក/ ក្រុមហ៊ុននឹងផ្តល់ប្រាក់លើកទឹកចិត្ត **បូកទឹកប្រាក់មួយថ្ងៃ** ចំពោះបុគ្គលិកដែលគ្មានអវត្តមានក្នុងមួយខែ។\n- ខ/ ក្រុមហ៊ុននឹងវាយតម្លៃចំពោះបុគ្គលិកដែលឆ្នើម នឹងត្រូវទទួលបានការលើកទឹកចិត្ត ដោយមានការតំឡើងប្រាក់បៀវត្សរ៍ ឬតំឡើងមុខងារ ។'],

  ['CHAPTER', 'ជំពូកទី៤ ៖ អវសានបញ្ញត្តិ', ''],
  ['ARTICLE', 'ប្រការ១៧', 'ប្រធានប្រតិបត្តិ ប្រធានផ្នែក និងបុគ្គលិកគ្រប់រូប ត្រូវអនុវត្តតាមបទបញ្ជាផ្ទៃក្នុងនេះ តាមភារៈកិច្ចរៀងៗខ្លួន ឲ្យមានប្រសិទ្ធភាពខ្ពស់ ។'],
  ['ARTICLE', 'ប្រការ១៨', 'បទបញ្ញត្តិទាំងឡាយណា ដែលមានខ្លឹមសារផ្ទុយពីបទបញ្ញត្តិនេះ ត្រូវចាត់ទុកជានិរាករណ៍ ។'],
  ['ARTICLE', 'ប្រការ១៩', 'សេចក្តីសម្រេចនេះមានប្រសិទ្ធភាពចាប់ពីថ្ងៃចុះហត្ថលេខានេះតទៅ ។'],
];

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const isAdmin = (user) => String(user?.role || '').toUpperCase() === 'ADMIN';
const actorName = (user) => String(user?.name || user?.email || '').slice(0, 150) || null;

let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = (async () => {
      const { rows: existing } = await executeQuery('SHOW TABLES LIKE ?', [T]);
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS \`${T}\` (
          \`id\` BIGINT NOT NULL AUTO_INCREMENT,
          \`kind\` VARCHAR(20) NOT NULL DEFAULT 'ARTICLE',
          \`title\` VARCHAR(255) NOT NULL DEFAULT '',
          \`body\` MEDIUMTEXT,
          \`sort_order\` INT NOT NULL DEFAULT 0,
          \`created_by\` VARCHAR(150) DEFAULT NULL,
          \`updated_by\` VARCHAR(150) DEFAULT NULL,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`idx_reg_order\` (\`sort_order\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      // Fill with the 2025 regulations only when the table is brand new, so deleting
      // everything later does not bring the old text back.
      if (existing.length === 0) {
        const values = DEFAULT_BLOCKS.map(([kind, title, body], i) => [kind, title, body, (i + 1) * STEP, 'system']);
        await executeQuery(`INSERT INTO \`${T}\` (kind, title, body, sort_order, created_by) VALUES ?`, [values]);
      }
    })().catch((err) => {
      tableReady = null; // retry on next request
      throw err;
    });
  }
  return tableReady;
}

async function listBlocks() {
  const { rows } = await executeQuery(
    `SELECT id, kind, title, body, sort_order, created_by, updated_by, created_at, updated_at
       FROM \`${T}\` ORDER BY sort_order ASC, id ASC`
  );
  return rows.map((r) => ({ ...r, id: Number(r.id), sort_order: Number(r.sort_order) }));
}

/** Saves the given id order as sort_order 10, 20, 30… in one statement. */
async function renumber(ids) {
  if (ids.length === 0) return;
  const cases = ids.map(() => 'WHEN ? THEN ?').join(' ');
  const params = [];
  ids.forEach((id, i) => params.push(id, (i + 1) * STEP));
  await executeQuery(`UPDATE \`${T}\` SET sort_order = CASE id ${cases} END WHERE id IN (?)`, [...params, ids]);
}

function readBlock(input) {
  const kind = String(input?.kind || '').toUpperCase();
  if (!KINDS.includes(kind)) throw httpError(400, 'ប្រភេទមិនត្រឹមត្រូវ');
  const title = String(input?.title ?? '').trim().slice(0, 255);
  const body = String(input?.body ?? '').replace(/\r\n/g, '\n').trim().slice(0, 60000);
  if (!title && !body) throw httpError(400, 'សូមបញ្ចូលចំណងជើង ឬខ្លឹមសារ');
  if (kind !== 'NOTE' && !title) throw httpError(400, 'សូមបញ្ចូលចំណងជើង');
  return { kind, title, body };
}

async function saveBlock(input, afterId, user) {
  const block = readBlock(input);
  const id = Number(input?.id) || null;
  if (id) {
    const { rows } = await executeQuery(
      `UPDATE \`${T}\` SET kind = ?, title = ?, body = ?, updated_by = ? WHERE id = ?`,
      [block.kind, block.title, block.body, actorName(user), id]
    );
    if (!rows.affectedRows) throw httpError(404, 'រកមិនឃើញ (ប្រហែលត្រូវបានលុបរួចហើយ)');
    return id;
  }
  const { rows } = await executeQuery(
    `INSERT INTO \`${T}\` (kind, title, body, sort_order, created_by, updated_by)
     SELECT ?, ?, ?, COALESCE(MAX(sort_order), 0) + ${STEP}, ?, ? FROM \`${T}\``,
    [block.kind, block.title, block.body, actorName(user), actorName(user)]
  );
  const newId = Number(rows.insertId);
  // It was added at the end. afterId 0 = move to the top; afterId N = right after block N.
  if (afterId === null || afterId === undefined || afterId === '') return newId;
  const after = Number(afterId);
  const ids = (await listBlocks()).map((b) => b.id).filter((x) => x !== newId);
  const at = after === 0 ? 0 : ids.indexOf(after) + 1;
  if (after !== 0 && at === 0) return newId; // that block is gone: keep it at the end
  ids.splice(at, 0, newId);
  await renumber(ids);
  return newId;
}

async function moveBlock(id, direction) {
  const ids = (await listBlocks()).map((b) => b.id);
  const i = ids.indexOf(Number(id));
  if (i < 0) throw httpError(404, 'រកមិនឃើញ');
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await renumber(ids);
}

export async function handleRegulationsAction(req, action) {
  try {
    await ensureTable();
    const user = req.user;

    if (action === 'regulations_list') {
      return [200, { ok: true, data: await listBlocks() }];
    }

    if (req.method !== 'POST') return [405, { ok: false, message: 'Method Not Allowed' }];
    if (!isAdmin(user)) return [403, { ok: false, message: 'មានតែ Admin ទេដែលអាចកែប្រែបទបញ្ជាផ្ទៃក្នុងបាន' }];
    const body = req.body || {};

    if (action === 'regulations_save') {
      const id = await saveBlock(body.block, body.afterId, user);
      return [200, { ok: true, id, data: await listBlocks() }];
    }
    if (action === 'regulations_delete') {
      const id = Number(body.id);
      if (!id) throw httpError(400, 'id មិនត្រឹមត្រូវ');
      await executeQuery(`DELETE FROM \`${T}\` WHERE id = ?`, [id]);
      return [200, { ok: true, data: await listBlocks() }];
    }
    if (action === 'regulations_move') {
      await moveBlock(body.id, body.direction === 'up' ? 'up' : 'down');
      return [200, { ok: true, data: await listBlocks() }];
    }
    return [400, { ok: false, message: `Unknown action: ${action}` }];
  } catch (err) {
    console.error('[regulations] api error:', err?.message);
    return [err.statusCode || 500, { ok: false, message: err?.message || 'Server error' }];
  }
}
