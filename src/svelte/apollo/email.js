import { requeteGraphQL } from './gql.js'

export async function envoyerMailResa(variables) {
    const query = `
                mutation envoiMail($email: [String!]!, $template: String) {
                    sendEmail(
                    from: "atelier@labonnefabrique.fr"
                    to: $email
                    templateId: "d-08bb9e1b96ac4d56a9210660cac6cd07"
                    dynamic_template_data: $template
                    ) {
                    success
                    }
                }
            `
    return requeteGraphQL(query, variables)
        .then((resultats)=> {
            return resultats.insert_reservationMachines
        })
}